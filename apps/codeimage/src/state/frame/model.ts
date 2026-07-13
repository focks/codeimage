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
export function clampFrameSize(value: number, min: number, max: number): number {
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
