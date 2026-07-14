import {describe, expect, it} from 'vitest';
import {
  computeResizeHeight,
  computeResizeWidth,
  resolveHandleDirection,
  type HorizontalResizeGeometry,
  type VerticalResizeGeometry,
} from './resizeMath';

const base: HorizontalResizeGeometry = {
  startWidth: 600,
  startX: 1000, // right handle, to the right of a centre at 700
  isLTR: true,
  contentFloor: 300,
  minWidth: 200,
  maxWidth: 1920,
};

describe('resolveHandleDirection', () => {
  it('is LTR when the handle starts right of the box centre', () => {
    expect(resolveHandleDirection(1000, 700)).toBe(true);
  });
  it('is RTL when the handle starts left of the box centre', () => {
    expect(resolveHandleDirection(400, 700)).toBe(false);
  });
});

describe('computeResizeWidth', () => {
  it('tracks the pointer 1:1 for a right (LTR) handle', () => {
    // pointer moves +50px to the right -> width grows by exactly 50
    expect(computeResizeWidth(1050, base)).toBe(650);
    // pointer moves -50px -> width shrinks by exactly 50
    expect(computeResizeWidth(950, base)).toBe(550);
  });

  it('tracks the pointer 1:1 for a left (RTL) handle', () => {
    const rtl: HorizontalResizeGeometry = {...base, isLTR: false, startX: 400};
    // pointer moves -50px to the left -> width grows by exactly 50
    expect(computeResizeWidth(350, rtl)).toBe(650);
    // pointer moves +50px -> width shrinks by exactly 50
    expect(computeResizeWidth(450, rtl)).toBe(550);
  });

  it('never renders below the content floor (code never wraps)', () => {
    // requested = 600 + 500 - 1000 = 100, far below the 300px content floor, so it
    // snaps up to the content floor (the code never wraps below its natural width).
    expect(computeResizeWidth(500, base)).toBe(base.contentFloor);
  });

  it('uses the larger of content floor and user minWidth', () => {
    const highMin: HorizontalResizeGeometry = {...base, minWidth: 500};
    // requested 100 (way below both) -> floored to the user min (500 > content 300)
    expect(computeResizeWidth(500, highMin)).toBe(500);
  });

  it('caps at maxWidth', () => {
    expect(computeResizeWidth(5000, base)).toBe(1920);
  });

  it('treats maxWidth 0 as uncapped', () => {
    const uncapped: HorizontalResizeGeometry = {...base, maxWidth: 0};
    expect(computeResizeWidth(5000, uncapped)).toBe(600 + 5000 - 1000);
  });

  it('returns whole pixels so the commit equals the last dragged value', () => {
    const frac: HorizontalResizeGeometry = {...base, startWidth: 600.4};
    expect(Number.isInteger(computeResizeWidth(1000.7, frac))).toBe(true);
  });
});

const vBase: VerticalResizeGeometry = {
  startHeight: 500,
  startY: 900, // bottom handle, below a centre at 700
  isTop: false,
  floor: 150,
  maxHeight: 1920,
};

describe('computeResizeHeight', () => {
  it('tracks the pointer 1:1 for a bottom handle', () => {
    // pointer moves +40px down -> height grows by exactly 40
    expect(computeResizeHeight(940, vBase)).toBe(540);
    // pointer moves -40px up -> height shrinks by exactly 40
    expect(computeResizeHeight(860, vBase)).toBe(460);
  });

  it('tracks the pointer 1:1 for a top handle', () => {
    const top: VerticalResizeGeometry = {...vBase, isTop: true, startY: 500};
    // pointer moves -40px up -> height grows by exactly 40
    expect(computeResizeHeight(460, top)).toBe(540);
    // pointer moves +40px down -> height shrinks by exactly 40
    expect(computeResizeHeight(540, top)).toBe(460);
  });

  it('clamps to the floor (window may shrink below content, never below floor)', () => {
    // request a tiny height -> floored
    expect(computeResizeHeight(200, vBase)).toBe(150);
  });

  it('height floor ignores content height (clip-to-content is the feature)', () => {
    // REGRESSION GUARD. Width clamps to `max-content` so code never wraps
    // (see computeResizeWidth), but height deliberately does the OPPOSITE: it may
    // shrink BELOW the natural content height and the code clips at the bottom.
    //
    // The geometry's `floor` is `max(MIN_FRAME_DRAG_HEIGHT, userMinHeight)` ONLY —
    // it must NEVER pick up the content/scroll height. If a future "symmetry" pass
    // re-adds a content floor to the height path (as the width path legitimately
    // has), this test fails: with a small floor (150) a drag that requests 220px —
    // far below any realistic multi-line content height — must render 220, not snap
    // up to some content height.
    const tallContentDrag: VerticalResizeGeometry = {
      startHeight: 900, // box started tall (content is ~900)
      startY: 1000,
      isTop: false, // bottom handle
      floor: 150, // only the sane drag minimum, no user minHeight
      maxHeight: 1920,
    };
    // Drag the bottom handle up by 680px -> requested 220, well under the ~900
    // content height. It must track to 220 (clip the code), NOT clamp to content.
    expect(computeResizeHeight(320, tallContentDrag)).toBe(220);
    // And it only stops at the explicit floor, never at content.
    expect(computeResizeHeight(0, tallContentDrag)).toBe(150);
  });

  it('floor is the user minHeight when it exceeds the hard minimum, still not content', () => {
    // With a user minHeight of 400 the drag clamps at exactly 400 (by design),
    // independent of how tall the content is — the floor is the user value, never
    // the content height. Mirrors the app wiring:
    // floor = resolveHeightFloor(MIN_FRAME_DRAG_HEIGHT=150, userMinHeight=400) = 400.
    const userFloored: VerticalResizeGeometry = {
      startHeight: 900,
      startY: 1000,
      isTop: false,
      floor: 400,
      maxHeight: 1920,
    };
    // Request 220 (below the 400 user floor) -> clamps at 400, NOT at content.
    expect(computeResizeHeight(320, userFloored)).toBe(400);
  });

  it('caps at maxHeight', () => {
    expect(computeResizeHeight(5000, vBase)).toBe(1920);
  });

  it('treats maxHeight 0 as uncapped', () => {
    const uncapped: VerticalResizeGeometry = {...vBase, maxHeight: 0};
    expect(computeResizeHeight(5000, uncapped)).toBe(500 + 5000 - 900);
  });

  it('returns whole pixels', () => {
    const frac: VerticalResizeGeometry = {...vBase, startHeight: 500.6};
    expect(Number.isInteger(computeResizeHeight(900.3, frac))).toBe(true);
  });
});
