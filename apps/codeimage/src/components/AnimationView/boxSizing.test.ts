import {describe, expect, it} from 'vitest';
import {
  interpolateBox,
  lerp,
  resolveFollowedContainerHeight,
  resolveSurfaceBox,
  slideContainerHeight,
  type BoxSize,
  type SlideHeightInput,
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

const AUTO: SlideHeightInput = {autoHeight: true, explicitHeight: 0};
const EXPLICIT = (h: number): SlideHeightInput => ({
  autoHeight: false,
  explicitHeight: h,
});
const CHROME = 214; // frame padding + header + content/surface padding

describe('slideContainerHeight', () => {
  const box: BoxSize = {width: 400, height: 246};

  it('returns the explicit height verbatim for an explicit-height slide', () => {
    expect(slideContainerHeight(EXPLICIT(300), box, CHROME)).toBe(300);
  });

  it('adds the chrome to the measured content box for an auto slide', () => {
    expect(slideContainerHeight(AUTO, box, CHROME)).toBe(246 + CHROME);
  });

  it('returns undefined for an auto slide with no measured box yet', () => {
    expect(slideContainerHeight(AUTO, undefined, CHROME)).toBeUndefined();
  });

  it('returns undefined when the slide input is missing', () => {
    expect(slideContainerHeight(undefined, box, CHROME)).toBeUndefined();
  });

  it('falls back to content sizing if explicit height is 0 (unset)', () => {
    // An explicit flag with a 0 height is treated as auto (nothing to follow).
    expect(slideContainerHeight(EXPLICIT(0), box, CHROME)).toBe(246 + CHROME);
  });
});

describe('resolveFollowedContainerHeight', () => {
  const boxes: (BoxSize | undefined)[] = [
    {width: 400, height: 100},
    {width: 400, height: 246},
  ];

  it('follows an explicit-height slide on a hold frame', () => {
    expect(
      resolveFollowedContainerHeight({
        slides: [EXPLICIT(300), AUTO],
        boxes,
        chromeOffset: CHROME,
        slideIndex: 0,
        isTransition: false,
        easedProgress: 0,
      }),
    ).toBe(300);
  });

  it('returns undefined for an auto slide on a hold frame (stay content-driven)', () => {
    // Auto holds must NOT be forced to a computed height — they keep hugging the
    // surface, byte-identical to the prior playback path.
    expect(
      resolveFollowedContainerHeight({
        slides: [AUTO, AUTO],
        boxes,
        chromeOffset: CHROME,
        slideIndex: 0,
        isTransition: false,
        easedProgress: 0,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when neither side of a transition is explicit', () => {
    // Auto -> auto transitions keep the existing surface-box interpolation; no
    // forced container height (avoids depending on the chrome-offset formula).
    expect(
      resolveFollowedContainerHeight({
        slides: [AUTO, AUTO],
        boxes,
        chromeOffset: CHROME,
        slideIndex: 0,
        isTransition: true,
        easedProgress: 0.5,
      }),
    ).toBeUndefined();
  });

  it('eases from an explicit slide to an auto slide across a transition', () => {
    // from = explicit 300; to = auto (246 + 214 = 460). Midpoint = 380.
    const at = (p: number) =>
      resolveFollowedContainerHeight({
        slides: [EXPLICIT(300), AUTO],
        boxes,
        chromeOffset: CHROME,
        slideIndex: 0,
        isTransition: true,
        easedProgress: p,
      });
    expect(at(0)).toBe(300);
    expect(at(1)).toBe(460);
    expect(at(0.5)).toBe(380);
  });

  it('eases between two explicit heights', () => {
    const at = (p: number) =>
      resolveFollowedContainerHeight({
        slides: [EXPLICIT(200), EXPLICIT(600)],
        boxes,
        chromeOffset: CHROME,
        slideIndex: 0,
        isTransition: true,
        easedProgress: p,
      });
    expect(at(0)).toBe(200);
    expect(at(0.25)).toBe(300);
    expect(at(1)).toBe(600);
  });

  it('clamps eased progress to the unit interval at the endpoints', () => {
    const params = {
      slides: [EXPLICIT(200), EXPLICIT(600)],
      boxes,
      chromeOffset: CHROME,
      slideIndex: 0,
      isTransition: true,
    };
    expect(resolveFollowedContainerHeight({...params, easedProgress: -1})).toBe(
      200,
    );
    expect(resolveFollowedContainerHeight({...params, easedProgress: 2})).toBe(
      600,
    );
  });
});
