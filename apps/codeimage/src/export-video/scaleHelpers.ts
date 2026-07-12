/**
 * Pure helpers for scale/dimension clamping. No DOM, no codec knowledge —
 * just arithmetic so callers can display warnings and the encoder can rely on
 * safe dimensions.
 */

/** Maximum pixel dimension that hardware encoders reliably handle. */
export const MAX_ENCODER_DIMENSION = 4096;

export interface ClampResult {
  /** The (possibly clamped) width in device pixels. */
  readonly width: number;
  /** The (possibly clamped) height in device pixels. */
  readonly height: number;
  /** True when either dimension was reduced to stay within MAX_ENCODER_DIMENSION. */
  readonly clamped: boolean;
  /** The effective pixelRatio after clamping (may be < requested ratio). */
  readonly effectiveRatio: number;
}

/**
 * Clamp a CSS size × pixelRatio so neither output dimension exceeds
 * `MAX_ENCODER_DIMENSION`. When clamping is needed the ratio is reduced
 * uniformly so the aspect ratio is preserved.
 *
 * Returns the clamped device-pixel dimensions and a `clamped` flag so callers
 * can surface a warning to the user without needing extra logic.
 */
export function clampDimensions(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): ClampResult {
  const rawWidth = cssWidth * pixelRatio;
  const rawHeight = cssHeight * pixelRatio;

  const limitingAxis = Math.max(rawWidth, rawHeight);
  if (limitingAxis <= MAX_ENCODER_DIMENSION) {
    return {
      width: rawWidth,
      height: rawHeight,
      clamped: false,
      effectiveRatio: pixelRatio,
    };
  }

  // Scale back the ratio so the largest axis hits exactly MAX_ENCODER_DIMENSION.
  const effectiveRatio = (pixelRatio * MAX_ENCODER_DIMENSION) / limitingAxis;
  return {
    width: cssWidth * effectiveRatio,
    height: cssHeight * effectiveRatio,
    clamped: true,
    effectiveRatio,
  };
}

/**
 * Whether any dimension would exceed MAX_ENCODER_DIMENSION at the requested
 * scale. Cheap predicate used by the UI to show/hide the clamp warning.
 */
export function wouldExceedLimit(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): boolean {
  return (
    cssWidth * pixelRatio > MAX_ENCODER_DIMENSION ||
    cssHeight * pixelRatio > MAX_ENCODER_DIMENSION
  );
}
