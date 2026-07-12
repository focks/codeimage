export interface FrameState {
  background: string | null;
  padding: number;
  radius: number;
  visible: boolean;
  opacity: number;
  autoWidth: boolean;
  scale: number;
  width: number;
  height: number;
  aspectRatio: string | null;
  /**
   * Minimum window (frame content) size in px. `0` means "off" (no minimum).
   * Applied as CSS min-width/min-height so autoWidth can't shrink the window
   * below it. Persisted per-slide so it snapshots like other frame fields, and
   * used by video export to keep a stable canvas size across slides.
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
>;

/** Bounds for the user-facing minimum-size controls. `0` disables the minimum. */
export const MIN_FRAME_SIZE = 0;
export const MAX_FRAME_MIN_WIDTH = 1920;
export const MAX_FRAME_MIN_HEIGHT = 1080;

/** Clamp a requested minimum dimension into the allowed range. */
export function clampFrameMinSize(value: number, max: number): number {
  if (!Number.isFinite(value)) return MIN_FRAME_SIZE;
  if (value < MIN_FRAME_SIZE) return MIN_FRAME_SIZE;
  if (value > max) return max;
  return Math.round(value);
}
