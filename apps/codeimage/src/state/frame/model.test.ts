import {describe, expect, it} from 'vitest';
import {
  clampFrameMinSize,
  clampFrameSize,
  coercePersistedFrameSize,
  MAX_FRAME_HEIGHT,
  MAX_FRAME_MIN_HEIGHT,
  MAX_FRAME_MIN_WIDTH,
  MAX_FRAME_WIDTH,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_SIZE,
  MIN_FRAME_WIDTH,
  resolveFrameHeight,
  resolveFrameMinHeight,
  resolveFrameWidth,
  type PersistedFrameState,
} from './model';

// The floor math that regressed: `rendered = max(basis, floor)` with `0` meaning
// "off" on either side. Width bakes the floor into `width` (content still wins via
// `min-width: max-content`); height splits it — basis on `height`, floor on
// `min-height` — because `max(100%, floor)` collapses against the indefinite
// ancestor and never grows the box.
describe('resolveFrameWidth', () => {
  it('is auto when both basis and floor are off (0)', () => {
    expect(resolveFrameWidth(0, 0)).toBe('auto');
  });

  it('is the explicit basis when there is no floor', () => {
    expect(resolveFrameWidth(600, 0)).toBe('600px');
  });

  it('is the floor alone when auto (basis 0) with a floor set', () => {
    expect(resolveFrameWidth(0, 900)).toBe('900px');
  });

  it('is max(basis, floor) when both are set', () => {
    expect(resolveFrameWidth(400, 900)).toBe('max(400px, 900px)');
    expect(resolveFrameWidth(1000, 900)).toBe('max(1000px, 900px)');
  });

  it('treats a negative floor as off', () => {
    expect(resolveFrameWidth(0, -5)).toBe('auto');
    expect(resolveFrameWidth(500, -5)).toBe('500px');
  });
});

describe('resolveFrameHeight (basis only, floor lives in min-height)', () => {
  it('is content-driven (100%) with no explicit basis', () => {
    expect(resolveFrameHeight(0)).toBe('100%');
  });

  it('pins the explicit/drag/playback basis in px', () => {
    expect(resolveFrameHeight(300)).toBe('300px');
    expect(resolveFrameHeight(1080)).toBe('1080px');
  });

  it('ignores a non-positive basis (stays content-driven)', () => {
    expect(resolveFrameHeight(-10)).toBe('100%');
  });
});

describe('resolveFrameMinHeight', () => {
  it('is the content-preserving default (100%) when the floor is off', () => {
    expect(resolveFrameMinHeight(0)).toBe('100%');
    expect(resolveFrameMinHeight(-1)).toBe('100%');
  });

  it('is the floor as a plain length so it yields max(basis, floor)', () => {
    expect(resolveFrameMinHeight(800)).toBe('800px');
    expect(resolveFrameMinHeight(1080)).toBe('1080px');
  });
});

describe('clampFrameMinSize', () => {
  it('returns 0 (off) for the disabled value', () => {
    expect(clampFrameMinSize(0, MAX_FRAME_MIN_WIDTH)).toBe(0);
  });

  it('passes through in-range values (rounded to whole px)', () => {
    expect(clampFrameMinSize(500, MAX_FRAME_MIN_WIDTH)).toBe(500);
    expect(clampFrameMinSize(320.4, MAX_FRAME_MIN_WIDTH)).toBe(320);
    expect(clampFrameMinSize(320.6, MAX_FRAME_MIN_WIDTH)).toBe(321);
  });

  it('clamps below the minimum up to 0', () => {
    expect(clampFrameMinSize(-1, MAX_FRAME_MIN_WIDTH)).toBe(MIN_FRAME_SIZE);
    expect(clampFrameMinSize(-9999, MAX_FRAME_MIN_HEIGHT)).toBe(MIN_FRAME_SIZE);
  });

  it('clamps above the max down to the max', () => {
    expect(clampFrameMinSize(99999, MAX_FRAME_MIN_WIDTH)).toBe(
      MAX_FRAME_MIN_WIDTH,
    );
    expect(clampFrameMinSize(MAX_FRAME_MIN_HEIGHT + 1, MAX_FRAME_MIN_HEIGHT)).toBe(
      MAX_FRAME_MIN_HEIGHT,
    );
  });

  it('accepts the exact max boundary', () => {
    expect(clampFrameMinSize(MAX_FRAME_MIN_WIDTH, MAX_FRAME_MIN_WIDTH)).toBe(
      MAX_FRAME_MIN_WIDTH,
    );
  });

  it('coerces non-finite input to 0', () => {
    expect(clampFrameMinSize(Number.NaN, MAX_FRAME_MIN_WIDTH)).toBe(
      MIN_FRAME_SIZE,
    );
    expect(clampFrameMinSize(Number.POSITIVE_INFINITY, MAX_FRAME_MIN_WIDTH)).toBe(
      MIN_FRAME_SIZE,
    );
    expect(clampFrameMinSize(Number.NEGATIVE_INFINITY, MAX_FRAME_MIN_WIDTH)).toBe(
      MIN_FRAME_SIZE,
    );
  });
});

describe('clampFrameSize', () => {
  it('passes through in-range values, rounded to whole px', () => {
    expect(clampFrameSize(700, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(700);
    expect(clampFrameSize(699.4, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(699);
    expect(clampFrameSize(699.6, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(700);
  });

  it('clamps below min up to min', () => {
    expect(clampFrameSize(10, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(
      MIN_FRAME_HEIGHT,
    );
    expect(clampFrameSize(50, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH)).toBe(
      MIN_FRAME_WIDTH,
    );
  });

  it('clamps above max down to max', () => {
    expect(clampFrameSize(99999, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(
      MAX_FRAME_HEIGHT,
    );
    expect(clampFrameSize(99999, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH)).toBe(
      MAX_FRAME_WIDTH,
    );
  });

  it('accepts the exact boundaries', () => {
    expect(clampFrameSize(MIN_FRAME_HEIGHT, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(
      MIN_FRAME_HEIGHT,
    );
    expect(clampFrameSize(MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(
      MAX_FRAME_HEIGHT,
    );
  });

  it('coerces non-finite input to min', () => {
    expect(clampFrameSize(Number.NaN, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT)).toBe(
      MIN_FRAME_HEIGHT,
    );
    expect(
      clampFrameSize(Number.POSITIVE_INFINITY, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH),
    ).toBe(MIN_FRAME_WIDTH);
  });
});

describe('coercePersistedFrameSize', () => {
  const base: PersistedFrameState = {
    background: '#000',
    padding: 64,
    radius: 8,
    visible: true,
    opacity: 100,
    minWidth: 0,
    minHeight: 0,
    autoWidth: true,
    autoHeight: true,
    width: 0,
    height: 0,
  };

  it('fills absent size fields to their defaults (auto on, sizes 0)', () => {
    // Simulate a pre-v5 slide: strip the new keys and the min-size keys.
    const legacy = {
      background: '#000',
      padding: 64,
      radius: 8,
      visible: true,
      opacity: 100,
    } as unknown as PersistedFrameState;
    const coerced = coercePersistedFrameSize(legacy);
    expect(coerced.autoWidth).toBe(true);
    expect(coerced.autoHeight).toBe(true);
    expect(coerced.width).toBe(0);
    expect(coerced.height).toBe(0);
    expect(coerced.minWidth).toBe(0);
    expect(coerced.minHeight).toBe(0);
  });

  it('preserves explicit size fields when present', () => {
    const coerced = coercePersistedFrameSize({
      ...base,
      autoWidth: false,
      autoHeight: false,
      width: 900,
      height: 700,
      minWidth: 320,
      minHeight: 200,
    });
    expect(coerced.autoWidth).toBe(false);
    expect(coerced.autoHeight).toBe(false);
    expect(coerced.width).toBe(900);
    expect(coerced.height).toBe(700);
    expect(coerced.minWidth).toBe(320);
    expect(coerced.minHeight).toBe(200);
  });

  it('treats a false auto flag as explicit, not as "absent"', () => {
    // `?? ` must only fill nullish — an explicit `false` must survive.
    const coerced = coercePersistedFrameSize({...base, autoWidth: false});
    expect(coerced.autoWidth).toBe(false);
  });
});
