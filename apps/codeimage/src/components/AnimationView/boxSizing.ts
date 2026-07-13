/**
 * Pure box-sizing math for the playback surface (problem A/B).
 *
 * The animated code surface must have a STABLE box for the whole of a slide (so the
 * window does not grow as the typewriter reveals text) and must SMOOTHLY morph its
 * box across a transition (so the window size eases from slide i's full layout to
 * slide i+1's, instead of hard-cutting to the destination). Both are pure functions
 * of the two slides' measured full-content boxes plus the eased transition progress,
 * so preview (rAF) and export (fixed-step seek) size the surface identically — the
 * seek-exact invariant. The two boxes are measured once from invisible ghost layers
 * (full final code, same metrics); only the interpolation factor changes per frame.
 */

/** A measured (or floored) box size in CSS pixels. */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/** Linear interpolation between `a` and `b` at factor `t` (t is pre-eased). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate the surface box from `from` to `to` at the (already eased) progress
 * `p`. `p<=0` yields `from` exactly, `p>=1` yields `to` exactly, so a hold segment
 * (which never enters here) and the transition endpoints line up pixel-for-pixel
 * with the adjacent static frames. A missing box (slide not yet measured) falls back
 * to the other side so the surface never collapses to 0.
 */
export function interpolateBox(
  from: BoxSize | undefined,
  to: BoxSize | undefined,
  p: number,
): BoxSize | undefined {
  if (!from && !to) return undefined;
  if (!from) return to;
  if (!to) return from;
  const t = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return {
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  };
}

/**
 * Resolve the surface box for a frame given the per-slide measured full-content
 * boxes, the active slide index, and whether the frame is a transition (and if so
 * its eased progress). Pure — a given set of inputs always yields the same box.
 *
 *   - non-transition (typing/hold): the active slide's own full box (constant for
 *     the whole slide -> the window never grows while text reveals, problem A).
 *   - transition: eased interpolation from slide i's full box to slide i+1's
 *     (smooth size morph across the boundary, problem B).
 *
 * The user's min-width/height floor is NOT applied here: the shared Frame
 * `.container` already floors the window via `max(width, floor)` on the playback
 * path (identically to the live editor) and hugs this surface via
 * `min-width: max-content`, so the container remains the single source of truth for
 * the floor.
 *
 * Returns `undefined` when neither adjacent slide has been measured yet, letting the
 * caller fall back to intrinsic (content-driven) sizing until the ghosts settle.
 */
export function resolveSurfaceBox(params: {
  readonly boxes: readonly (BoxSize | undefined)[];
  readonly slideIndex: number;
  readonly isTransition: boolean;
  readonly easedProgress: number;
}): BoxSize | undefined {
  const {boxes, slideIndex, isTransition, easedProgress} = params;
  const current = boxes[slideIndex];
  const box = isTransition
    ? interpolateBox(current, boxes[slideIndex + 1], easedProgress)
    : current;
  return box;
}
