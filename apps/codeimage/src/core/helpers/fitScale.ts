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

/**
 * The scale to hold constant for the whole of a resize gesture ("frozen scale").
 *
 * A live drag rewrites the frame's natural size every pointer-move. If the fit
 * scale were recomputed each of those frames, the transform (and, in the old
 * margin approach, layout) would change under the cursor — the frame would grow
 * with the drag yet simultaneously shrink to refit, fighting itself into the
 * steppy feel. Canvas apps instead FREEZE the zoom during the gesture and let the
 * box overflow, then refit on release. We freeze the scale captured at
 * pointer-down; the drag deltas already divide by this scale (see
 * {@link scaleCorrectedPointer}), so a constant scale keeps tracking exactly 1:1.
 *
 * Pure passthrough with the same non-positive/non-finite guard the rest of the
 * module uses, so the freeze value is always a safe multiplier.
 */
export function freezeScale(scaleAtPointerDown: number): number {
  return Number.isFinite(scaleAtPointerDown) && scaleAtPointerDown > 0
    ? scaleAtPointerDown
    : 1;
}

/**
 * The scale to animate TO when a gesture releases (or any non-drag change fires):
 * the fresh fit scale for the frame's now-settled natural size. This is just
 * {@link computeFitScale} — named so the refit intent reads clearly at the call
 * site and can be unit-tested as "the eased-refit target" independent of the DOM.
 *
 * Returned as `{scale, changed}` against the currently-displayed scale so the
 * caller can skip arming the CSS transition when the target is already on screen
 * (no pointless animation, no badge flicker). `changed` uses an epsilon so
 * sub-pixel float drift never counts as a change.
 */
export function refitTarget(
  frame: FitSize,
  available: FitSize,
  currentScale: number,
): {readonly scale: number; readonly changed: boolean} {
  const scale = computeFitScale(frame, available);
  const changed = Math.abs(scale - currentScale) > 1e-4;
  return {scale, changed};
}
