/**
 * Pure timeline math for the transition/present-from-here UX. No stores, no DOM,
 * no wall clock — just functions of a `Timeline`, so they are unit-tested directly
 * (mirrors videoExportMath.ts). The controller imports these and drives the rAF
 * loop; keeping the math here avoids pulling the store singletons into tests.
 */

import type {Timeline} from './timeline';

/** Padding on each side of a boundary preview window, in ms. */
export const PREVIEW_PAD_MS = 150;

/**
 * Injected time (ms) at which slide `index` first appears on screen: the start of
 * its ENTRY segment (the `transition` carrying leaving index `index - 1`) so the
 * entry animation into that slide is included; falls back to its hold start, then
 * 0. Slide 0 (and anything ≤ 0) starts at 0. Used to present from the active slide.
 */
export function slideEntryStartMs(timeline: Timeline, index: number): number {
  if (index <= 0) return 0;
  const transition = timeline.segments.find(
    s => s.phase === 'transition' && s.slideIndex === index - 1,
  );
  if (transition) return transition.startMs;
  const hold = timeline.segments.find(
    s => s.phase === 'hold' && s.slideIndex === index,
  );
  return hold ? hold.startMs : 0;
}

/**
 * Time window (ms) for a one-shot boundary preview: the segment that ENTERS slide
 * `boundaryIndex`, padded by {@link PREVIEW_PAD_MS} on each side so the eye catches
 * the before/after hold. `boundaryIndex` is a SLIDE index: 0 = slide 0's intro
 * entry (a `typing` segment), i>0 = the `transition` into slide i (carrying leaving
 * index i-1). Returns `null` when that slide has no entry segment (e.g. a `none`
 * cut, or an out-of-range index) — nothing to preview.
 */
export function boundaryPreviewWindow(
  timeline: Timeline,
  boundaryIndex: number,
): {startMs: number; endMs: number} | null {
  const entry = timeline.segments.find(s =>
    boundaryIndex === 0
      ? s.phase === 'typing' && s.slideIndex === 0
      : s.phase === 'transition' && s.slideIndex === boundaryIndex - 1,
  );
  if (!entry) return null;
  const startMs = Math.max(0, entry.startMs - PREVIEW_PAD_MS);
  const endMs = Math.min(
    timeline.totalDurationMs,
    entry.startMs + entry.durationMs + PREVIEW_PAD_MS,
  );
  return {startMs, endMs};
}
