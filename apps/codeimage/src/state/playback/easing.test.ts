import {describe, expect, it} from 'vitest';
import {easeInOutCubic, easeOutCubic, linear} from './easing';

describe('linear', () => {
  it('is the identity on [0,1]', () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.25)).toBe(0.25);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
  });

  it('clamps outside [0,1]', () => {
    expect(linear(-1)).toBe(0);
    expect(linear(2)).toBe(1);
  });
});

describe('easeOutCubic', () => {
  it('pins the endpoints', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('decelerates: is ABOVE linear in the interior (front-loaded)', () => {
    // 1 - (1-0.25)^3 = 1 - 0.421875 = 0.578125
    expect(easeOutCubic(0.25)).toBeCloseTo(0.578125, 6);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
    // Strictly greater than the linear value => decelerating curve.
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    expect(easeOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it('clamps outside [0,1]', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('easeInOutCubic', () => {
  it('pins the endpoints and the exact midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    // Symmetric S-curve: 0.5 maps to exactly 0.5, so the temporal midpoint and
    // the eased midpoint coincide (relied on by the chrome half-swap).
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it('is BELOW linear in the first half (ease-in) and above in the second', () => {
    // 4 * 0.25^3 = 0.0625
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 6);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    // By symmetry, 0.75 maps to 1 - 0.0625 = 0.9375 (> 0.75).
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375, 6);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it('is symmetric about 0.5: f(t) + f(1-t) === 1', () => {
    for (const t of [0.1, 0.25, 0.33, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 6);
    }
  });

  it('clamps outside [0,1]', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe('non-linear frame deltas (acceleration/deceleration, not constant)', () => {
  it('easeInOutCubic produces unequal deltas at equal time steps', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(easeInOutCubic);
    const deltas = steps.slice(1).map((v, i) => v - steps[i]);
    // Ease-in-out: small at the ends, large in the middle. The middle two deltas
    // must strictly exceed the outer two — i.e. acceleration then deceleration.
    expect(deltas[1]).toBeGreaterThan(deltas[0]);
    expect(deltas[2]).toBeGreaterThan(deltas[3]);
    // Deltas are NOT all equal (that would be linear).
    const allEqual = deltas.every(d => Math.abs(d - deltas[0]) < 1e-9);
    expect(allEqual).toBe(false);
  });
});
