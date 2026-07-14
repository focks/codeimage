export interface FrameState {
  background: string | null;
  padding: number;
  radius: number;
  visible: boolean;
  opacity: number;
  /**
   * When `true` (default) the frame's WIDTH is content-driven — the window hugs
   * its code. When `false` an explicit `width` (px) is applied and the horizontal
   * drag handles have set it. Mirrors `autoHeight` exactly (symmetric axes).
   */
  autoWidth: boolean;
  /**
   * When `true` (default) the frame's HEIGHT is content-driven. When `false` an
   * explicit `height` (px) is applied and the vertical drag handles have set it.
   * Symmetric counterpart of `autoWidth`.
   */
  autoHeight: boolean;
  scale: number;
  /**
   * Transient UI flag (NOT persisted): `true` while a resize-handle drag is in
   * flight. Freezes the zoom-to-fit scale and disables the eased refit transition
   * for the duration of the gesture so the frame tracks the cursor without the fit
   * fighting it (see FrameHandler). Reset to `false` on drag end.
   */
  resizing: boolean;
  /**
   * Explicit window width in px. Only applied when `autoWidth` is `false`; when
   * `autoWidth` is `true` this is ignored and the box is content-driven.
   */
  width: number;
  /**
   * Explicit window height in px. Only applied when `autoHeight` is `false`; when
   * `autoHeight` is `true` this is ignored and the box is content-driven.
   */
  height: number;
  aspectRatio: string | null;
  /**
   * Minimum window (frame content) size in px. `0` means "off" (no minimum).
   * Applied as CSS min-width/min-height so an explicit size can't shrink the
   * window below it. Persisted per-slide so it snapshots like other frame fields,
   * and used by video export to keep a stable canvas size across slides.
   */
  minWidth: number;
  minHeight: number;
}

export type PersistedFrameState = Pick<
  FrameState,
  | 'background'
  | 'padding'
  | 'radius'
  | 'visible'
  | 'opacity'
  | 'minWidth'
  | 'minHeight'
  | 'autoWidth'
  | 'autoHeight'
  | 'width'
  | 'height'
>;

/** Bounds for the user-facing minimum-size controls. `0` disables the minimum. */
export const MIN_FRAME_SIZE = 0;
export const MAX_FRAME_MIN_WIDTH = 1920;
export const MAX_FRAME_MIN_HEIGHT = 1080;

/** Bounds for an explicit window size (px). Matches the resize-handle clamps. */
export const MIN_FRAME_WIDTH = 200;
export const MAX_FRAME_WIDTH = 1920;
export const MIN_FRAME_HEIGHT = 100;
export const MAX_FRAME_HEIGHT = 1920;

/**
 * Sane absolute floor for a *drag* height: small enough to shrink the window well
 * below its content (so the code clips) but large enough to keep the window header
 * visible. Larger than {@link MIN_FRAME_HEIGHT} (the typed-field floor) on purpose —
 * a drag should never collapse the window to a sliver, whereas a deliberately typed
 * value may go as low as the field allows.
 */
export const MIN_FRAME_DRAG_HEIGHT = 150;

/**
 * Resolve the rendered frame WIDTH as a CSS length string, honouring the user
 * floor. Semantics: `rendered = max(basis, floor)` where `basis` is the explicit
 * width (px) when auto-width is off, else content-driven. `basis === 0` means
 * auto/content-driven; `floor === 0` (or negative) means "off".
 *
 * The container keeps `min-width: max-content` so content always grows past the
 * floor. Both the floor and an explicit basis are definite lengths, so a floored
 * explicit width is a valid `max(<len>, <len>)`; a floored auto width is a plain
 * `${floor}px` (the intrinsic min-width lets content win when it is wider).
 */
export function resolveFrameWidth(basis: number, floor: number): string {
  const size = basis > 0 ? basis : 0;
  const min = floor > 0 ? floor : 0;
  if (size && min) return `max(${size}px, ${min}px)`;
  if (size) return `${size}px`;
  return min ? `${min}px` : 'auto';
}

/**
 * Resolve the rendered frame HEIGHT basis as a CSS length string — WITHOUT the
 * floor. `basis > 0` pins a definite pixel height (explicit / drag / playback
 * followed); otherwise the box stays content-driven (`100%`, which resolves to
 * content against the indefinite ancestor). The floor is applied separately as a
 * `min-height` length (see {@link resolveFrameMinHeight}) because a percentage
 * inside `max(100%, floor)` collapses against that indefinite ancestor and never
 * reaches the floor.
 */
export function resolveFrameHeight(basis: number): string {
  return basis > 0 ? `${basis}px` : '100%';
}

/**
 * Resolve the frame `min-height` CSS length. A user floor (`> 0`) is applied as a
 * plain pixel length, which natively yields `max(basisH, floor)` in every mode
 * while still letting taller content grow past it. `0`/off falls back to the
 * content-preserving default (`100%`).
 */
export function resolveFrameMinHeight(floor: number): string {
  return floor > 0 ? `${floor}px` : '100%';
}

/** Clamp a requested minimum dimension into the allowed range. */
export function clampFrameMinSize(value: number, max: number): number {
  if (!Number.isFinite(value)) return MIN_FRAME_SIZE;
  if (value < MIN_FRAME_SIZE) return MIN_FRAME_SIZE;
  if (value > max) return max;
  return Math.round(value);
}

/**
 * Clamp a requested explicit window dimension into `[min, max]`, rounding to a
 * whole pixel. Non-finite input coerces to `min`. Used for both the drag handles
 * and the numeric panel fields so the two entry points agree.
 */
export function clampFrameSize(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return Math.round(value);
}

/**
 * Coerce a persisted frame slice that may predate explicit-size fields. Absent
 * `autoWidth`/`autoHeight` read as `true` (content-driven, the historical
 * behavior) and absent `width`/`height` read as `0`. Keeps old decks rendering
 * exactly as before while new fields default to "auto".
 */
export function coercePersistedFrameSize(
  frame: PersistedFrameState,
): PersistedFrameState {
  return {
    ...frame,
    minWidth: frame.minWidth ?? 0,
    minHeight: frame.minHeight ?? 0,
    autoWidth: frame.autoWidth ?? true,
    autoHeight: frame.autoHeight ?? true,
    width: frame.width ?? 0,
    height: frame.height ?? 0,
  };
}
