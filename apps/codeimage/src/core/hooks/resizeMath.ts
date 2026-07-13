/**
 * Pure geometry for the horizontal frame resize, split out of the DOM-driven
 * {@link createHorizontalResize} hook so the arithmetic can be unit-tested and,
 * crucially, so a live pointer-move needs NO forced synchronous layout.
 *
 * The old per-move path set the container width, read `getBoundingClientRect()`
 * back to discover the browser's `min-width: max-content` clamp, then removed it —
 * two full relayouts (frame + CodeMirror) on every mouse-move. Because the content
 * floor (`max-content`) is intrinsic to the code and never changes during a drag,
 * it can be measured ONCE at drag start and the per-move width becomes plain math.
 */

export interface HorizontalResizeGeometry {
  /** Container width (px) captured at pointer-down. */
  startWidth: number;
  /** Pointer X (px) captured at pointer-down. */
  startX: number;
  /** `true` when the grabbed handle is to the right of the box centre. */
  isLTR: boolean;
  /**
   * The intrinsic content floor (px): the browser's `min-width: max-content`
   * width, measured once at drag start. The width can never render below it, so a
   * requested width under it snaps up to it (the code never wraps — CLAMP-to
   * -content, the width counterpart of height's CLIP-to-frame).
   */
  contentFloor: number;
  /** User/style minimum width (px). `0` = off. */
  minWidth: number;
  /** Maximum width (px). `0` = off. */
  maxWidth: number;
}

/**
 * Which edge of the box the grabbed handle drives, from the pointer-down X and the
 * box centre. A handle to the right of centre grows the box as the pointer moves
 * right (LTR); one to the left grows it as the pointer moves left (RTL). Pure.
 */
export function resolveHandleDirection(startX: number, centre: number): boolean {
  return startX > centre;
}

/**
 * The rendered width for a live pointer position, as plain arithmetic — no DOM
 * reads. Mirrors what the browser would clamp the requested width to:
 *
 *   requested = startWidth ± (pointerDelta)         // grow away from centre
 *   rendered  = clamp(requested, floor, maxWidth)   // floor = max(content, min)
 *
 * The floor is the larger of the intrinsic content width (so code never wraps) and
 * the user/style `minWidth`; `maxWidth` caps the top (0 = uncapped). The result is
 * a whole pixel so the committed value equals the last dragged value exactly.
 */
export function computeResizeWidth(
  pointerX: number,
  geometry: HorizontalResizeGeometry,
): number {
  const {startWidth, startX, isLTR, contentFloor, minWidth, maxWidth} = geometry;
  const requested = isLTR
    ? startWidth + pointerX - startX
    : startWidth - pointerX + startX;
  const floor = Math.max(contentFloor, minWidth, 0);
  let width = requested;
  if (width < floor) width = floor;
  if (maxWidth > 0 && width > maxWidth) width = maxWidth;
  return Math.round(width);
}

export interface VerticalResizeGeometry {
  /** Container height (px) captured at pointer-down. */
  startHeight: number;
  /** Pointer Y (px) captured at pointer-down. */
  startY: number;
  /** `true` when the grabbed handle is above the box centre (the top edge). */
  isTop: boolean;
  /** Effective height floor (px) — `max(hardMin, userMinHeight)`. */
  floor: number;
  /** Maximum height (px). `0` = off. */
  maxHeight: number;
}

/**
 * The rendered height for a live pointer position, as plain arithmetic — the
 * vertical counterpart of {@link computeResizeWidth}. The box grows away from its
 * vertical centre (top handle up or bottom handle down both enlarge it) and is
 * clamped to `[floor, maxHeight]`. Unlike width there is no content floor: the
 * window is allowed to shrink below its content (the code clips — CLIP-to-frame).
 */
export function computeResizeHeight(
  pointerY: number,
  geometry: VerticalResizeGeometry,
): number {
  const {startHeight, startY, isTop, floor, maxHeight} = geometry;
  const delta = isTop ? startY - pointerY : pointerY - startY;
  let height = startHeight + delta;
  if (height < floor) height = floor;
  if (maxHeight > 0 && height > maxHeight) height = maxHeight;
  return Math.round(height);
}
