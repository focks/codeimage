import {describe, expect, it} from 'vitest';
import {
  interpolateBox,
  lerp,
  resolveSurfaceBox,
  type BoxSize,
} from './boxSizing';

const A: BoxSize = {width: 100, height: 200};
const B: BoxSize = {width: 300, height: 400};

describe('lerp', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(100, 300, 0.25)).toBe(150);
  });
});

describe('interpolateBox', () => {
  it('yields the from box at p<=0 and the to box at p>=1 (endpoints pixel-exact)', () => {
    expect(interpolateBox(A, B, 0)).toEqual(A);
    expect(interpolateBox(A, B, -0.5)).toEqual(A);
    expect(interpolateBox(A, B, 1)).toEqual(B);
    expect(interpolateBox(A, B, 2)).toEqual(B);
  });

  it('interpolates both axes at the midpoint', () => {
    expect(interpolateBox(A, B, 0.5)).toEqual({width: 200, height: 300});
  });

  it('interpolates monotonically so the box morphs smoothly (no snap)', () => {
    const widths = [0, 0.25, 0.5, 0.75, 1].map(
      p => interpolateBox(A, B, p)!.width,
    );
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
    expect(widths).toEqual([100, 150, 200, 250, 300]);
  });

  it('falls back to the present box when one side is missing', () => {
    expect(interpolateBox(undefined, B, 0.5)).toEqual(B);
    expect(interpolateBox(A, undefined, 0.5)).toEqual(A);
    expect(interpolateBox(undefined, undefined, 0.5)).toBeUndefined();
  });
});

describe('resolveSurfaceBox', () => {
  const boxes = [A, B, {width: 600, height: 900}];

  it('holds the active slide box for a non-transition frame (no growth, problem A)', () => {
    // Same box regardless of progress within the slide.
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(
        resolveSurfaceBox({
          boxes,
          slideIndex: 0,
          isTransition: false,
          easedProgress: p,
        }),
      ).toEqual(A);
    }
  });

  it('morphs from slide i to slide i+1 across a transition (problem B)', () => {
    expect(
      resolveSurfaceBox({
        boxes,
        slideIndex: 0,
        isTransition: true,
        easedProgress: 0,
      }),
    ).toEqual(A);
    expect(
      resolveSurfaceBox({
        boxes,
        slideIndex: 0,
        isTransition: true,
        easedProgress: 1,
      }),
    ).toEqual(B);
    expect(
      resolveSurfaceBox({
        boxes,
        slideIndex: 0,
        isTransition: true,
        easedProgress: 0.5,
      }),
    ).toEqual({width: 200, height: 300});
  });

  it('returns undefined when the needed boxes are not measured yet', () => {
    expect(
      resolveSurfaceBox({
        boxes: [undefined, undefined],
        slideIndex: 0,
        isTransition: false,
        easedProgress: 0,
      }),
    ).toBeUndefined();
  });
});
