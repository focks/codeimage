import {describe, expect, it} from 'vitest';
import {
  clampDimensions,
  MAX_ENCODER_DIMENSION,
  wouldExceedLimit,
} from './scaleHelpers';

describe('clampDimensions', () => {
  it('returns dimensions unchanged when within the limit', () => {
    const result = clampDimensions(800, 600, 2);
    expect(result).toEqual({
      width: 1600,
      height: 1200,
      clamped: false,
      effectiveRatio: 2,
    });
  });

  it('returns clamped=false at exactly the limit', () => {
    // 1024 × 4 = 4096, right at the boundary.
    const result = clampDimensions(1024, 768, 4);
    expect(result.clamped).toBe(false);
    expect(result.width).toBe(4096);
    expect(result.height).toBe(3072);
  });

  it('clamps when width exceeds MAX_ENCODER_DIMENSION', () => {
    // 1200 × 4 = 4800 → exceeds 4096.
    const result = clampDimensions(1200, 400, 4);
    expect(result.clamped).toBe(true);
    // Width should be exactly MAX_ENCODER_DIMENSION.
    expect(result.width).toBeCloseTo(MAX_ENCODER_DIMENSION, 5);
    // Ratio is reduced proportionally.
    expect(result.effectiveRatio).toBeCloseTo(
      (4 * MAX_ENCODER_DIMENSION) / (1200 * 4),
      5,
    );
  });

  it('clamps when height exceeds MAX_ENCODER_DIMENSION', () => {
    // 400 × 4 = 1600 (ok); 1200 × 4 = 4800 (exceeds).
    const result = clampDimensions(400, 1200, 4);
    expect(result.clamped).toBe(true);
    expect(result.height).toBeCloseTo(MAX_ENCODER_DIMENSION, 5);
  });

  it('preserves aspect ratio when clamping', () => {
    const result = clampDimensions(1600, 900, 4);
    if (result.clamped) {
      // width/height ratio should equal cssWidth/cssHeight.
      expect(result.width / result.height).toBeCloseTo(1600 / 900, 5);
    }
  });

  it('does not clamp at 1x or 2x for typical canvas sizes', () => {
    // A typical editor canvas is ~800 × 600 CSS px.
    expect(clampDimensions(800, 600, 1).clamped).toBe(false);
    expect(clampDimensions(800, 600, 2).clamped).toBe(false);
  });

  it('may clamp at 4x for large canvases', () => {
    // 1100 × 4 = 4400 > 4096.
    expect(clampDimensions(1100, 800, 4).clamped).toBe(true);
  });
});

describe('wouldExceedLimit', () => {
  it('returns false when within the limit', () => {
    expect(wouldExceedLimit(800, 600, 2)).toBe(false);
  });

  it('returns false at exactly the limit', () => {
    expect(wouldExceedLimit(1024, 768, 4)).toBe(false);
  });

  it('returns true when width exceeds the limit', () => {
    expect(wouldExceedLimit(1200, 400, 4)).toBe(true);
  });

  it('returns true when height exceeds the limit', () => {
    expect(wouldExceedLimit(400, 1200, 4)).toBe(true);
  });

  it('returns false for 1x and 2x on typical canvas sizes', () => {
    expect(wouldExceedLimit(1920, 1080, 1)).toBe(false);
    expect(wouldExceedLimit(1920, 1080, 2)).toBe(false);
  });
});
