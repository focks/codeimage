import {describe, expect, it} from 'vitest';
import type {KeyedToken, KeyedTokensInfo} from 'shiki-magic-move/core';
import {
  caretOpacity,
  fadeLayers,
  fullTokens,
  morphLayers,
  revealTypedTokens,
  slideLines,
} from './tokenReveal';

/** Build a minimal KeyedTokensInfo from (content, key) pairs. */
function makeInfo(pairs: [content: string, key: string][]): KeyedTokensInfo {
  const tokens: KeyedToken[] = pairs.map(([content, key], i) => ({
    content,
    key,
    offset: i,
    color: '#fff',
  })) as KeyedToken[];
  return {
    code: pairs.map(p => p[0]).join(''),
    hash: 'h',
    tokens,
    lineNumbers: false,
    themeName: 'test',
  } as KeyedTokensInfo;
}

describe('revealTypedTokens', () => {
  const info = makeInfo([
    ['const', 'k1'],
    [' ', 'k2'],
    ['x', 'k3'],
    ['\n', 'k4'],
    ['y', 'k5'],
  ]);
  // code = "const x\ny" => length 9

  it('reveals nothing at progress 0', () => {
    expect(revealTypedTokens(info, 0)).toHaveLength(0);
  });

  it('reveals everything at progress 1', () => {
    const out = revealTypedTokens(info, 1);
    expect(out.map(t => t.content).join('')).toBe('const x\ny');
  });

  it('reveals a partial token mid-progress (pure function of progress)', () => {
    // 9 chars total; progress 0.5 => floor(4.5) = 4 chars => "cons"
    const out = revealTypedTokens(info, 0.5);
    expect(out.map(t => t.content).join('')).toBe('cons');
  });

  it('is deterministic and seekable: jumping equals stepping', () => {
    const direct = revealTypedTokens(info, 0.7).map(t => t.content).join('');
    const alsoDirect = revealTypedTokens(info, 0.7).map(t => t.content).join('');
    expect(direct).toBe(alsoDirect);
    // Monotonic growth in revealed length across progress.
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const len = revealTypedTokens(info, p)
        .map(t => t.content)
        .join('').length;
      expect(len).toBeGreaterThanOrEqual(prev);
      prev = len;
    }
  });

  it('clamps out-of-range progress', () => {
    expect(revealTypedTokens(info, -1)).toHaveLength(0);
    expect(
      revealTypedTokens(info, 5)
        .map(t => t.content)
        .join(''),
    ).toBe('const x\ny');
  });
});

describe('fullTokens', () => {
  it('returns all tokens at opacity 1', () => {
    const info = makeInfo([
      ['a', 'k1'],
      ['\n', 'k2'],
    ]);
    const out = fullTokens(info);
    expect(out).toHaveLength(2);
    expect(out.every(t => t.opacity === 1)).toBe(true);
    expect(out[1].isNewline).toBe(true);
  });
});

describe('morphLayers', () => {
  const from = makeInfo([
    ['const', 'shared'],
    [' a', 'only-from'],
  ]);
  const to = makeInfo([
    ['const', 'shared'],
    [' b', 'only-to'],
  ]);

  it('at progress 0: leaving fully visible, entering hidden', () => {
    const {leaving, entering} = morphLayers(from, to, 0);
    expect(leaving.opacity).toBe(1);
    expect(entering.opacity).toBe(0);
    // matched token stays opaque in both layers
    expect(leaving.tokens.find(t => t.key === 'shared')!.opacity).toBe(1);
    // unmatched leaving token fully visible at p=0
    expect(leaving.tokens.find(t => t.key === 'only-from')!.opacity).toBe(1);
    // unmatched entering token hidden at p=0
    expect(entering.tokens.find(t => t.key === 'only-to')!.opacity).toBe(0);
  });

  it('at progress 1: leaving hidden, entering fully visible', () => {
    const {leaving, entering} = morphLayers(from, to, 1);
    expect(leaving.opacity).toBe(0);
    expect(entering.opacity).toBe(1);
    expect(leaving.tokens.find(t => t.key === 'only-from')!.opacity).toBe(0);
    expect(entering.tokens.find(t => t.key === 'only-to')!.opacity).toBe(1);
    // matched token stays put/opaque
    expect(entering.tokens.find(t => t.key === 'shared')!.opacity).toBe(1);
  });

  it('at progress 0.5: cross-dissolve half-way', () => {
    const {leaving, entering} = morphLayers(from, to, 0.5);
    expect(leaving.opacity).toBeCloseTo(0.5);
    expect(entering.opacity).toBeCloseTo(0.5);
    expect(leaving.tokens.find(t => t.key === 'only-from')!.opacity).toBeCloseTo(
      0.5,
    );
    expect(entering.tokens.find(t => t.key === 'only-to')!.opacity).toBeCloseTo(
      0.5,
    );
  });

  it('is deterministic for a given progress (seekable)', () => {
    const a = morphLayers(from, to, 0.33);
    const b = morphLayers(from, to, 0.33);
    expect(a).toEqual(b);
  });

  it('eases the fade: opacity is BELOW linear early (easeInOutCubic)', () => {
    // easeInOutCubic(0.25) = 0.0625, so the entering layer is well under 0.25.
    const {entering, leaving} = morphLayers(from, to, 0.25);
    expect(entering.opacity).toBeCloseTo(0.0625, 5);
    expect(leaving.opacity).toBeCloseTo(0.9375, 5);
    expect(entering.opacity).toBeLessThan(0.25);
  });

  it('non-linear deltas at equal steps (accel then decel)', () => {
    const at = (p: number) => morphLayers(from, to, p).entering.opacity;
    const d1 = at(0.5) - at(0.25); // middle
    const d0 = at(0.25) - at(0); // first
    const d3 = at(1) - at(0.75); // last
    expect(d1).toBeGreaterThan(d0);
    expect(d1).toBeGreaterThan(d3);
  });
});

describe('fadeLayers', () => {
  const from = makeInfo([['a', 'k1']]);
  const to = makeInfo([['b', 'k2']]);

  it('pins the endpoints', () => {
    expect(fadeLayers(from, to, 0).entering.opacity).toBe(0);
    expect(fadeLayers(from, to, 1).entering.opacity).toBe(1);
  });

  it('eases opacity (easeInOutCubic) and is symmetric at the midpoint', () => {
    expect(fadeLayers(from, to, 0.5).entering.opacity).toBeCloseTo(0.5, 6);
    expect(fadeLayers(from, to, 0.25).entering.opacity).toBeCloseTo(0.0625, 5);
    expect(fadeLayers(from, to, 0.75).entering.opacity).toBeCloseTo(0.9375, 5);
  });

  it('is seek-exact: same progress => identical layers', () => {
    expect(fadeLayers(from, to, 0.4)).toEqual(fadeLayers(from, to, 0.4));
  });
});

describe('slideLines', () => {
  // Line 0 stays ("keep"); line 1 changes ("old" -> "new").
  const from = makeInfo([
    ['keep', 'l0a'],
    ['\n', 'nl'],
    ['old', 'l1a'],
  ]);
  const to = makeInfo([
    ['keep', 'l0b'],
    ['\n', 'nl2'],
    ['new', 'l1b'],
  ]);

  it('eases X-position with easeOutCubic (front-loaded travel)', () => {
    // Entering added line travels 0.35*(1 - easeOutCubic(p)). At p=0.25,
    // easeOutCubic(0.25)=0.578125, so translateX = 0.35*0.421875 ≈ 0.14766.
    const added = slideLines(from, to, 0.25).entering.find(l =>
      l.key.startsWith('a-'),
    )!;
    expect(added.translateX).toBeCloseTo(0.35 * (1 - 0.578125), 5);
    // At the same progress, opacity uses easeInOutCubic(0.25)=0.0625 — a DIFFERENT
    // curve, proving position and opacity are eased independently.
    expect(added.opacity).toBeCloseTo(0.0625, 5);
  });

  it('settles fully at progress 1 (no residual offset)', () => {
    const added = slideLines(from, to, 1).entering.find(l =>
      l.key.startsWith('a-'),
    )!;
    expect(added.translateX).toBeCloseTo(0, 6);
    expect(added.opacity).toBeCloseTo(1, 6);
  });

  it('is seek-exact: same progress => identical layout', () => {
    expect(slideLines(from, to, 0.4)).toEqual(slideLines(from, to, 0.4));
  });
});

describe('caretOpacity', () => {
  it('is deterministic (pure function of progress) — seek-exact', () => {
    expect(caretOpacity(0.37, 40)).toBe(caretOpacity(0.37, 40));
  });

  it('blinks: a square wave that toggles between on and dim', () => {
    // 60 chars, period 6 => 10 blink half-cycles across the type-in.
    const values = new Set<number>();
    for (let p = 0; p <= 1; p += 0.02) values.add(caretOpacity(p, 60));
    // Exactly two distinct opacity levels (on / dim), never a smooth ramp.
    expect(values).toEqual(new Set([1, 0.25]));
  });

  it('starts visible and stays a clean 0/1-style toggle', () => {
    expect(caretOpacity(0, 40)).toBe(1);
    // First `period` chars are "on"; the next `period` are dim.
    expect(caretOpacity(6 / 40, 40)).toBe(0.25); // 6 chars typed => second half
  });
});
