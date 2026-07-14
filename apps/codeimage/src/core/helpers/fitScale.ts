/**
 * Pure geometry for the zoom-to-fit canvas preview.
 *
 * When the frame grows taller (or wider) than the visible canvas area its edges
 * — and therefore the resize handles — fall off-screen and become un-grabbable
 * (the bottom handle ends up under the filmstrip). Design tools solve this by
 * zooming the preview to fit; we do the same, scaling a wrapper around the frame
 * down so the whole box (handles included) stays on-screen and editable.
 *
 * These functions are DOM-free so they can be unit-tested and reused by both the
 * live preview (FrameHandler) and the drag math (scale-corrected pointer deltas).
 */

/** A rectangular size in CSS pixels. */
export interface FitSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The fit scale for a frame of `frame` natural size inside an `available` box.
 *
 *   scale = min(1, availW / frameW, availH / frameH)
 *
 * Never scales UP (capped at 1): a frame that already fits renders at 100%. A
 * non-positive or non-finite frame/available dimension yields 1 (nothing to fit
 * against — leave the preview untouched rather than divide by zero).
 */
export function computeFitScale(frame: FitSize, available: FitSize): number {
  const {width: fw, height: fh} = frame;
  const {width: aw, height: ah} = available;
  if (
    !Number.isFinite(fw) ||
    !Number.isFinite(fh) ||
    !Number.isFinite(aw) ||
    !Number.isFinite(ah) ||
    fw <= 0 ||
    fh <= 0 ||
    aw <= 0 ||
    ah <= 0
  ) {
    return 1;
  }
  return Math.min(1, aw / fw, ah / fh);
}

/**
 * Divide a raw pointer delta (screen px) by the current fit scale to get the
 * delta in FRAME px. When the preview is zoomed out to `scale` < 1 the cursor
 * moves `scale`× slower across the shrunk frame, so a screen delta of `d`
 * corresponds to `d / scale` real frame pixels — feed THIS to the resize math or
 * dragging feels slowed while zoomed out. At scale 1 it is the identity.
 *
 * A non-positive/non-finite scale falls back to 1 (never amplify to infinity).
 */
export function frameDeltaFromScreen(screenDelta: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return screenDelta / s;
}

/**
 * Map a raw screen pointer coordinate onto the FRAME-pixel axis the resize math
 * expects, given the axis origin (the coordinate at drag start) and the current
 * fit scale. Keeps the drag 1:1 in frame pixels: the returned value advances by
 * `1 / scale` frame px per screen px, anchored so that at the origin it equals
 * the origin (no jump at pointer-down).
 *
 *   corrected = origin + (screen - origin) / scale
 *
 * The resize hooks capture `startY`/`startX` as the origin at pointer-down and
 * then compute `pointer - start`, so feeding them this corrected coordinate makes
 * that difference the scale-corrected frame delta while preserving the origin.
 */
export function scaleCorrectedPointer(
  screen: number,
  origin: number,
  scale: number,
): number {
  return origin + frameDeltaFromScreen(screen - origin, scale);
}
