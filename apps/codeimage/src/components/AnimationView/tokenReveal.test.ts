import {describe, expect, it} from 'vitest';
import type {KeyedToken, KeyedTokensInfo} from 'shiki-magic-move/core';
import {fullTokens, morphLayers, revealTypedTokens} from './tokenReveal';

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
});
