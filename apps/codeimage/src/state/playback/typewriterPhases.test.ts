import {describe, expect, it} from 'vitest';
import {
  TYPEWRITER_CLEAR_MS,
  TYPEWRITER_EMPTY_MS,
  typewriterEntryTotalMs,
  typewriterSizingSettleAt,
  typewriterSubPhaseAt,
} from './typewriterPhases';
import {typewriterDurationMs} from './timeline';

// 10 chars at 100ms/char => 1000ms type. hasOutgoing entry:
//   clear[0,150) empty[150,450) type[450,1450). total = 1450ms.
// slide-0 (no outgoing) entry:
//   empty[0,300) type[300,1300). total = 1300ms.
const CHAR_COUNT = 10;
const CHAR_MS = 100;
const TYPE_MS = typewriterDurationMs(CHAR_COUNT, CHAR_MS); // 1000

describe('typewriterEntryTotalMs', () => {
  it('adds clear + empty beats around the type-time when there is outgoing text', () => {
    expect(typewriterEntryTotalMs(CHAR_COUNT, CHAR_MS, true)).toBe(
      TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS + TYPE_MS,
    ); // 1450
  });

  it('skips the clear beat on slide 0 (no outgoing text)', () => {
    expect(typewriterEntryTotalMs(CHAR_COUNT, CHAR_MS, false)).toBe(
      TYPEWRITER_EMPTY_MS + TYPE_MS,
    ); // 1300
  });

  it('collapses to 0 when there is no code to type (preserves skip-empty-intro)', () => {
    expect(typewriterEntryTotalMs(0, CHAR_MS, false)).toBe(0);
    expect(typewriterEntryTotalMs(0, CHAR_MS, true)).toBe(0);
    expect(typewriterEntryTotalMs(CHAR_COUNT, 0, true)).toBe(0);
  });
});

describe('typewriterSubPhaseAt (with outgoing text: clear -> empty -> type)', () => {
  const total = TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS + TYPE_MS; // 1450
  const at = (localMs: number) =>
    typewriterSubPhaseAt(localMs / total, CHAR_COUNT, CHAR_MS, true);

  it('progress 0 => clear at localProgress 0', () => {
    expect(at(0)).toEqual({phase: 'clear', localProgress: 0});
  });

  it('mid-clear', () => {
    const s = at(TYPEWRITER_CLEAR_MS / 2); // 75ms into a 150ms clear
    expect(s.phase).toBe('clear');
    expect(s.localProgress).toBeCloseTo(0.5, 6);
  });

  it('clear/empty boundary belongs to empty (localProgress 0)', () => {
    const s = at(TYPEWRITER_CLEAR_MS); // exactly 150ms
    expect(s.phase).toBe('empty');
    expect(s.localProgress).toBeCloseTo(0, 6);
  });

  it('mid-empty', () => {
    const s = at(TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS / 2); // 150+150
    expect(s.phase).toBe('empty');
    expect(s.localProgress).toBeCloseTo(0.5, 6);
  });

  it('empty/type boundary belongs to type (localProgress 0)', () => {
    const s = at(TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS); // 450ms
    expect(s.phase).toBe('type');
    expect(s.localProgress).toBeCloseTo(0, 6);
  });

  it('mid-type: reveal progress is linear over the char-time', () => {
    const s = at(TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS + TYPE_MS / 2); // 950ms
    expect(s.phase).toBe('type');
    expect(s.localProgress).toBeCloseTo(0.5, 6);
  });

  it('progress 1 => type fully revealed', () => {
    const s = typewriterSubPhaseAt(1, CHAR_COUNT, CHAR_MS, true);
    expect(s).toEqual({phase: 'type', localProgress: 1});
  });
});

describe('typewriterSubPhaseAt (slide 0: no clear beat)', () => {
  const total = TYPEWRITER_EMPTY_MS + TYPE_MS; // 1300
  const at = (localMs: number) =>
    typewriterSubPhaseAt(localMs / total, CHAR_COUNT, CHAR_MS, false);

  it('progress 0 => empty (never clear) at localProgress 0', () => {
    expect(at(0)).toEqual({phase: 'empty', localProgress: 0});
  });

  it('empty/type boundary belongs to type', () => {
    const s = at(TYPEWRITER_EMPTY_MS); // 300ms
    expect(s.phase).toBe('type');
    expect(s.localProgress).toBeCloseTo(0, 6);
  });

  it('never reports a clear sub-phase across the whole entry', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(typewriterSubPhaseAt(p, CHAR_COUNT, CHAR_MS, false).phase).not.toBe(
        'clear',
      );
    }
  });
});

describe('typewriterSubPhaseAt (degenerate + determinism)', () => {
  it('a zero-code entry settles as fully typed (renderer shows nothing to reveal)', () => {
    expect(typewriterSubPhaseAt(0.5, 0, CHAR_MS, true)).toEqual({
      phase: 'type',
      localProgress: 1,
    });
  });

  it('clamps out-of-range progress', () => {
    expect(typewriterSubPhaseAt(-1, CHAR_COUNT, CHAR_MS, true)).toEqual({
      phase: 'clear',
      localProgress: 0,
    });
    expect(typewriterSubPhaseAt(5, CHAR_COUNT, CHAR_MS, true)).toEqual({
      phase: 'type',
      localProgress: 1,
    });
  });

  it('is seek-exact: jumping to a progress equals stepping to it', () => {
    expect(typewriterSubPhaseAt(0.37, CHAR_COUNT, CHAR_MS, true)).toEqual(
      typewriterSubPhaseAt(0.37, CHAR_COUNT, CHAR_MS, true),
    );
  });

  it('sub-phase order is monotonic across the entry (clear -> empty -> type)', () => {
    const rank = {clear: 0, empty: 1, type: 2} as const;
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const r = rank[typewriterSubPhaseAt(p, CHAR_COUNT, CHAR_MS, true).phase];
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('typewriterSizingSettleAt', () => {
  it('is the fraction of the entry occupied by clear + empty (window fixed after)', () => {
    // with outgoing: (150 + 300) / 1450.
    expect(typewriterSizingSettleAt(CHAR_COUNT, CHAR_MS, true)).toBeCloseTo(
      (TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS) /
        (TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS + TYPE_MS),
      6,
    );
    // slide 0: 300 / 1300.
    expect(typewriterSizingSettleAt(CHAR_COUNT, CHAR_MS, false)).toBeCloseTo(
      TYPEWRITER_EMPTY_MS / (TYPEWRITER_EMPTY_MS + TYPE_MS),
      6,
    );
  });

  it('the settle point lines up with the start of the type sub-phase', () => {
    const settle = typewriterSizingSettleAt(CHAR_COUNT, CHAR_MS, true);
    // Just before settle: still in the beats (not type). At/after: type.
    expect(
      typewriterSubPhaseAt(settle - 1e-6, CHAR_COUNT, CHAR_MS, true).phase,
    ).toBe('empty');
    expect(typewriterSubPhaseAt(settle, CHAR_COUNT, CHAR_MS, true).phase).toBe(
      'type',
    );
  });
});
