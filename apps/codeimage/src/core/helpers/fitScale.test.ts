import {describe, expect, it} from 'vitest';
import {
  computeResizeHeight,
  type VerticalResizeGeometry,
} from '../hooks/resizeMath';
import {
  computeFitScale,
  frameDeltaFromScreen,
  freezeScale,
  refitTarget,
  scaleCorrectedPointer,
} from './fitScale';

describe('computeFitScale', () => {
  it('returns 1 when the frame already fits inside the available area', () => {
    expect(
      computeFitScale({width: 600, height: 400}, {width: 1000, height: 800}),
    ).toBe(1);
  });

  it('never scales UP a small frame (capped at 1)', () => {
    expect(
      computeFitScale({width: 100, height: 100}, {width: 1000, height: 1000}),
    ).toBe(1);
  });

  it('fits a too-tall frame by the vertical ratio (the binding axis)', () => {
    // 1080 tall in a 600-tall area -> 600/1080 ~= 0.555..., width fits so height wins
    expect(
      computeFitScale({width: 700, height: 1080}, {width: 1000, height: 600}),
    ).toBeCloseTo(600 / 1080, 6);
  });

  it('fits a too-wide frame by the horizontal ratio (the binding axis)', () => {
    expect(
      computeFitScale({width: 1600, height: 400}, {width: 800, height: 800}),
    ).toBeCloseTo(800 / 1600, 6);
  });

  it('takes the smaller ratio when both axes overflow', () => {
    // width ratio 0.5, height ratio 0.4 -> 0.4 wins (fits both)
    expect(
      computeFitScale({width: 1600, height: 2000}, {width: 800, height: 800}),
    ).toBeCloseTo(0.4, 6);
  });

  it('returns 1 for non-positive or non-finite dimensions (no divide-by-zero)', () => {
    expect(computeFitScale({width: 0, height: 400}, {width: 800, height: 800})).toBe(1);
    expect(computeFitScale({width: 600, height: 0}, {width: 800, height: 800})).toBe(1);
    expect(computeFitScale({width: 600, height: 400}, {width: 0, height: 800})).toBe(1);
    expect(
      computeFitScale({width: NaN, height: 400}, {width: 800, height: 800}),
    ).toBe(1);
  });
});

describe('frameDeltaFromScreen', () => {
  it('is the identity at scale 1', () => {
    expect(frameDeltaFromScreen(50, 1)).toBe(50);
    expect(frameDeltaFromScreen(-30, 1)).toBe(-30);
  });

  it('amplifies the delta into frame pixels when zoomed out', () => {
    // At 50% zoom a 50px screen move is a 100px frame move.
    expect(frameDeltaFromScreen(50, 0.5)).toBe(100);
    // At 80% zoom a 40px screen move is a 50px frame move.
    expect(frameDeltaFromScreen(40, 0.8)).toBeCloseTo(50, 6);
  });

  it('falls back to identity for a non-positive/non-finite scale', () => {
    expect(frameDeltaFromScreen(50, 0)).toBe(50);
    expect(frameDeltaFromScreen(50, -1)).toBe(50);
    expect(frameDeltaFromScreen(50, NaN)).toBe(50);
  });
});

describe('scaleCorrectedPointer', () => {
  it('returns the origin unchanged (no jump at pointer-down)', () => {
    expect(scaleCorrectedPointer(1000, 1000, 0.5)).toBe(1000);
  });

  it('advances 1/scale frame px per screen px from the origin', () => {
    // origin 1000, moved +50 screen px at 50% zoom -> +100 frame px -> 1100
    expect(scaleCorrectedPointer(1050, 1000, 0.5)).toBe(1100);
    // moved -50 screen px -> -100 frame px -> 900
    expect(scaleCorrectedPointer(950, 1000, 0.5)).toBe(900);
  });

  it('is the identity mapping at scale 1', () => {
    expect(scaleCorrectedPointer(1050, 1000, 1)).toBe(1050);
  });

  it('keeps the committed frame delta equal to screenDelta / scale', () => {
    // This is the property the resize hooks rely on: pointer - start == frameDelta
    const origin = 400;
    const scale = 0.82;
    const screen = 400 + 90; // 90px screen drag
    const corrected = scaleCorrectedPointer(screen, origin, scale);
    expect(corrected - origin).toBeCloseTo(90 / scale, 6);
  });
});

/**
 * The end-to-end drag property the fix depends on: when the preview is zoomed out,
 * feeding the vertical resize math a scale-corrected pointer keeps the committed
 * height change equal to the RAW screen drag divided by the scale — i.e. the frame
 * tracks 1:1 in frame pixels, so dragging never feels slowed while zoomed out.
 */
describe('scale-corrected vertical drag (fitScale + resizeMath)', () => {
  const geometry: VerticalResizeGeometry = {
    startHeight: 1080,
    startY: 400, // drag origin; the bottom handle so pulling UP shrinks
    isTop: false,
    floor: 150,
    maxHeight: 4000,
  };

  it('shrinks by screenDelta / scale when dragging the bottom handle up while zoomed', () => {
    const scale = 0.5;
    // Cursor moves 100px UP on screen (from Y=400 to Y=300).
    const corrected = scaleCorrectedPointer(300, geometry.startY, scale);
    const height = computeResizeHeight(corrected, geometry);
    // 100 screen px / 0.5 = 200 frame px shrink -> 1080 - 200 = 880.
    expect(height).toBe(880);
    // The committed delta equals the cursor delta divided by the scale.
    expect(geometry.startHeight - height).toBe(100 / scale);
  });

  it('is a plain 1:1 drag at scale 1 (identity)', () => {
    const corrected = scaleCorrectedPointer(300, geometry.startY, 1);
    const height = computeResizeHeight(corrected, geometry);
    // 100 screen px up -> 100 frame px shrink -> 980.
    expect(height).toBe(980);
    expect(geometry.startHeight - height).toBe(100);
  });
});

describe('freezeScale', () => {
  it('passes a valid positive scale through unchanged (the frozen value)', () => {
    expect(freezeScale(0.42)).toBe(0.42);
    expect(freezeScale(1)).toBe(1);
  });

  it('falls back to 1 for a non-positive / non-finite scale (safe multiplier)', () => {
    expect(freezeScale(0)).toBe(1);
    expect(freezeScale(-0.5)).toBe(1);
    expect(freezeScale(NaN)).toBe(1);
    expect(freezeScale(Infinity)).toBe(1);
  });
});

/**
 * A frozen-scale drag must track 1:1 in FRAME pixels for the WHOLE gesture even as
 * the frame overflows the fit area — i.e. the scale captured at pointer-down is the
 * only scale used, and the committed height still equals startHeight ± screenDelta
 * / frozenScale at every intermediate point. This is what lets the frame follow the
 * cursor monotonically during a grow drag instead of shrinking to refit.
 */
describe('frozen-scale drag correction (constant scale over the gesture)', () => {
  const geometry: VerticalResizeGeometry = {
    startHeight: 400,
    startY: 300, // bottom handle: pulling DOWN grows
    isTop: false,
    floor: 150,
    maxHeight: 4000,
  };

  it('grows monotonically with the cursor at a constant frozen scale', () => {
    const frozen = freezeScale(0.5);
    const heights = [40, 80, 160, 320, 500].map(screenDown => {
      const corrected = scaleCorrectedPointer(
        geometry.startY + screenDown,
        geometry.startY,
        frozen,
      );
      return computeResizeHeight(corrected, geometry);
    });
    // Each 1px of screen drag is 1/0.5 = 2px of frame height: strictly increasing.
    expect(heights).toEqual([480, 560, 720, 1040, 1400]);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it('uses ONLY the frozen scale — a would-be mid-drag refit does not change tracking', () => {
    // Freeze at 0.5; even though the growing frame would refit to a smaller scale
    // mid-drag, the correction keeps using 0.5, so the committed height is stable.
    const frozen = freezeScale(0.5);
    const corrected = scaleCorrectedPointer(
      geometry.startY + 200,
      geometry.startY,
      frozen,
    );
    expect(computeResizeHeight(corrected, geometry)).toBe(400 + 200 / 0.5);
  });
});

describe('refitTarget (eased-refit target computation)', () => {
  it('is the fresh computeFitScale for the settled size', () => {
    const {scale} = refitTarget(
      {width: 700, height: 1080},
      {width: 1000, height: 600},
      0.5,
    );
    expect(scale).toBeCloseTo(600 / 1080, 6);
  });

  it('flags a real scale change vs the currently-displayed scale', () => {
    // Displayed 0.9, fresh fit 0.5 -> changed.
    const grown = refitTarget(
      {width: 1600, height: 2000},
      {width: 800, height: 800},
      0.9,
    );
    expect(grown.changed).toBe(true);
    expect(grown.scale).toBeCloseTo(0.4, 6);
  });

  it('reports unchanged when the fresh fit already matches the displayed scale', () => {
    // Frame fits, fit scale is 1, and 1 is already displayed -> no re-arm, no flicker.
    const same = refitTarget(
      {width: 600, height: 400},
      {width: 1000, height: 800},
      1,
    );
    expect(same.scale).toBe(1);
    expect(same.changed).toBe(false);
  });

  it('treats sub-epsilon float drift as unchanged (no pointless animation)', () => {
    const drift = refitTarget(
      {width: 700, height: 1080},
      {width: 1000, height: 600},
      600 / 1080 + 1e-6,
    );
    expect(drift.changed).toBe(false);
  });
});
