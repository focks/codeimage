import {describe, expect, it} from 'vitest';
import {
  clampFrameMinSize,
  MAX_FRAME_MIN_HEIGHT,
  MAX_FRAME_MIN_WIDTH,
  MIN_FRAME_SIZE,
} from './model';

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
