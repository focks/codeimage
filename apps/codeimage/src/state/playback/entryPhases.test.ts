import {describe, expect, it} from 'vitest';
import {
  entrySizingSettleAt,
  entrySubPhaseAt,
  entryTotalMs,
  typeBeatMs,
  typewriterSpec,
  TYPEWRITER_CLEAR_MS,
  TYPEWRITER_EMPTY_MS,
  windowSpec,
} from './entryPhases';

// 10 chars at 100ms/char => 1000ms type beat. A window (fade/slide) entry with a
// 500ms window: window[0,500) type[500,1500). total = 1500ms.
const CHAR_COUNT = 10;
const CHAR_MS = 100;
const TYPE_MS = typeBeatMs(CHAR_COUNT, CHAR_MS); // 1000
const WINDOW_MS = 500;

describe('typeBeatMs', () => {
  it('is charCount * charMs', () => {
    expect(typeBeatMs(10, 100)).toBe(1000);
    expect(typeBeatMs(3, 50)).toBe(150);
  });

  it('collapses to 0 for empty code or a non-positive rate', () => {
    expect(typeBeatMs(0, 100)).toBe(0);
    expect(typeBeatMs(10, 0)).toBe(0);
    expect(typeBeatMs(-1, 100)).toBe(0);
  });
});

describe('windowSpec / entryTotalMs (fade/slide composite)', () => {
  it('total is windowMs + typeMs', () => {
    expect(entryTotalMs(windowSpec(WINDOW_MS, CHAR_COUNT, CHAR_MS))).toBe(
      WINDOW_MS + TYPE_MS,
    ); // 1500
  });

  it('collapses to 0 when there is no code to type', () => {
    expect(entryTotalMs(windowSpec(WINDOW_MS, 0, CHAR_MS))).toBe(0);
    expect(entryTotalMs(windowSpec(WINDOW_MS, CHAR_COUNT, 0))).toBe(0);
  });

  it('clamps a negative window to 0 (type-only entry)', () => {
    expect(entryTotalMs(windowSpec(-100, CHAR_COUNT, CHAR_MS))).toBe(TYPE_MS);
  });
});

describe('entrySubPhaseAt (window family: window -> type)', () => {
  const spec = windowSpec(WINDOW_MS, CHAR_COUNT, CHAR_MS);
  const total = WINDOW_MS + TYPE_MS; // 1500
  const at = (localMs: number) => entrySubPhaseAt(localMs / total, spec);

  it('progress 0 => window at localProgress 0', () => {
    expect(at(0)).toEqual({phase: 'window', localProgress: 0});
  });

  it('mid-window', () => {
    const s = at(WINDOW_MS / 2); // 250ms into a 500ms window
    expect(s.phase).toBe('window');
    expect(s.localProgress).toBeCloseTo(0.5, 6);
  });

  it('window/type boundary belongs to type (localProgress 0)', () => {
    const s = at(WINDOW_MS); // exactly 500ms — the empty editor is fully in
    expect(s.phase).toBe('type');
    expect(s.localProgress).toBeCloseTo(0, 6);
  });

  it('mid-type: reveal progress is linear over the char-time', () => {
    const s = at(WINDOW_MS + TYPE_MS / 2); // 1000ms
    expect(s.phase).toBe('type');
    expect(s.localProgress).toBeCloseTo(0.5, 6);
  });

  it('progress 1 => type fully revealed', () => {
    expect(entrySubPhaseAt(1, spec)).toEqual({phase: 'type', localProgress: 1});
  });

  it('never reports a clear/empty sub-phase (those are typewriter-only)', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const phase = entrySubPhaseAt(p, spec).phase;
      expect(phase === 'clear' || phase === 'empty').toBe(false);
    }
  });
});

describe('entrySubPhaseAt (window family: slide 0, no window)', () => {
  // A zero window still passes through the empty editor: type beat starts at 0.
  const spec = windowSpec(0, CHAR_COUNT, CHAR_MS);

  it('progress 0 => type at localProgress 0 (empty editor already in)', () => {
    expect(entrySubPhaseAt(0, spec)).toEqual({phase: 'type', localProgress: 0});
  });

  it('is all type across the entry', () => {
    for (let p = 0; p <= 1.0001; p += 0.1) {
      expect(entrySubPhaseAt(p, spec).phase).toBe('type');
    }
  });
});

describe('entrySubPhaseAt (degenerate + determinism)', () => {
  const spec = windowSpec(WINDOW_MS, CHAR_COUNT, CHAR_MS);

  it('a zero-code window entry settles as fully typed', () => {
    expect(entrySubPhaseAt(0.5, windowSpec(WINDOW_MS, 0, CHAR_MS))).toEqual({
      phase: 'type',
      localProgress: 1,
    });
  });

  it('clamps out-of-range progress', () => {
    expect(entrySubPhaseAt(-1, spec)).toEqual({
      phase: 'window',
      localProgress: 0,
    });
    expect(entrySubPhaseAt(5, spec)).toEqual({phase: 'type', localProgress: 1});
  });

  it('is seek-exact: jumping to a progress equals stepping to it', () => {
    expect(entrySubPhaseAt(0.42, spec)).toEqual(entrySubPhaseAt(0.42, spec));
  });

  it('sub-phase order is monotonic across the entry (window -> type)', () => {
    const rank = {window: 0, type: 1} as const;
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const phase = entrySubPhaseAt(p, spec).phase as 'window' | 'type';
      const r = rank[phase];
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('entrySizingSettleAt (window family)', () => {
  it('is the fraction of the entry occupied by the window beat', () => {
    expect(entrySizingSettleAt(windowSpec(WINDOW_MS, CHAR_COUNT, CHAR_MS))).toBeCloseTo(
      WINDOW_MS / (WINDOW_MS + TYPE_MS),
      6,
    ); // 500 / 1500
  });

  it('lines up with the start of the type sub-phase', () => {
    const spec = windowSpec(WINDOW_MS, CHAR_COUNT, CHAR_MS);
    const settle = entrySizingSettleAt(spec);
    expect(entrySubPhaseAt(settle - 1e-6, spec).phase).toBe('window');
    expect(entrySubPhaseAt(settle, spec).phase).toBe('type');
  });
});

describe('typewriterSpec routes through the same core', () => {
  it('total matches clear + empty + type with outgoing text', () => {
    expect(entryTotalMs(typewriterSpec(CHAR_COUNT, CHAR_MS, true))).toBe(
      TYPEWRITER_CLEAR_MS + TYPEWRITER_EMPTY_MS + TYPE_MS,
    );
  });

  it('skips the clear beat on slide 0 (no outgoing text)', () => {
    expect(entryTotalMs(typewriterSpec(CHAR_COUNT, CHAR_MS, false))).toBe(
      TYPEWRITER_EMPTY_MS + TYPE_MS,
    );
    expect(entrySubPhaseAt(0, typewriterSpec(CHAR_COUNT, CHAR_MS, false))).toEqual(
      {phase: 'empty', localProgress: 0},
    );
  });
});
