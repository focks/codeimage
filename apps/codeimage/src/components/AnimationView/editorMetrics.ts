/**
 * Font/box metrics of the live CodeMirror editor, mirrored so the AnimationView
 * playback surface lays code out identically. When ManagedFrame swaps
 * CanvasEditor -> AnimationView on Play, any metric drift shifts the whole code
 * block (problem P1). These values are the ground truth read from the rendered
 * editor DOM (`.cm-content` / `.cm-line`) and CodeMirror's inherited CSS:
 *
 *   - font-size:   the user's editor `fontSize` option (default 16px).
 *   - line-height: font-size * 1.4 — the computed `.cm-line` box. The 1.4 is an
 *     inherited UNITLESS line-height, so the line box scales with font-size at
 *     EVERY size. Measured exact in-browser at 12/14/16/18/20/24/28:
 *       12 -> 16.8   14 -> 19.6   16 -> 22.4   18 -> 25.2
 *       20 -> 28.0   24 -> 33.6   28 -> 39.2   (all = size * 1.4)
 *   - content pad:  4px 0 (CodeMirror `.cm-content` vertical padding) — FIXED,
 *     does NOT scale with font-size (measured constant across sizes).
 *   - line pad:    0 2px 0 8px (CustomEditor override of the CM `.cm-line` pad)
 *     — also FIXED (independent of font-size).
 *   - tab-size:    4      (CM default)
 *
 * Font family + weight + size are the user options (read live from the store);
 * the ratio + paddings are fixed by the editor's own CSS, so mirroring the exact
 * numbers keeps the swap pixel-stable without racing a DOM measurement.
 */

/** Default code font size in px (mirrors DEFAULT_FONT_SIZE in editor/model.ts). */
export const DEFAULT_EDITOR_FONT_SIZE = 16;

export const EDITOR_METRICS = {
  /** Rendered font size of a code glyph, in px (the 16px default). */
  fontSizePx: DEFAULT_EDITOR_FONT_SIZE,
  /** Unitless line-height multiplier (size * 1.4 line box, at every size). */
  lineHeight: 1.4,
  /** `.cm-content` vertical padding (top === bottom), in px. Fixed. */
  contentPaddingBlockPx: 4,
  /** `.cm-line` left padding (CustomEditor override), in px. Fixed. */
  linePaddingLeftPx: 8,
  /** `.cm-line` right padding, in px. Fixed. */
  linePaddingRightPx: 2,
  /** `tab-size` of the code content. */
  tabSize: 4,
} as const;

/**
 * The resolved metrics for a chosen font size. Only `fontSizePx` varies with the
 * size; `lineHeight` is the unitless ratio (so the line box already scales) and
 * the paddings/tabSize are fixed by CodeMirror's CSS. Pure — a given size always
 * yields the same metrics, so preview and export mirror the editor identically.
 */
export interface EditorMetrics {
  readonly fontSizePx: number;
  readonly lineHeight: number;
  readonly contentPaddingBlockPx: number;
  readonly linePaddingLeftPx: number;
  readonly linePaddingRightPx: number;
  readonly tabSize: number;
}

/**
 * Resolve the editor metrics for `fontSizePx`. The font size is the only
 * size-dependent value (measured: line box = size * 1.4, paddings constant), so
 * this simply substitutes the size into the fixed base metrics. Non-finite or
 * non-positive input falls back to the 16px default so callers stay safe.
 */
export function editorMetrics(fontSizePx: number): EditorMetrics {
  const size =
    Number.isFinite(fontSizePx) && fontSizePx > 0
      ? fontSizePx
      : DEFAULT_EDITOR_FONT_SIZE;
  return {
    fontSizePx: size,
    lineHeight: EDITOR_METRICS.lineHeight,
    contentPaddingBlockPx: EDITOR_METRICS.contentPaddingBlockPx,
    linePaddingLeftPx: EDITOR_METRICS.linePaddingLeftPx,
    linePaddingRightPx: EDITOR_METRICS.linePaddingRightPx,
    tabSize: EDITOR_METRICS.tabSize,
  };
}

/** The rendered line box height in px for a font size (size * lineHeight). */
export function lineBoxHeightPx(fontSizePx: number): number {
  const m = editorMetrics(fontSizePx);
  return m.fontSizePx * m.lineHeight;
}

/**
 * The `padding` shorthand mirroring the editor's content + line box padding. The
 * paddings are fixed (font-size-independent), so this takes no size argument.
 */
export function surfacePadding(): string {
  const {contentPaddingBlockPx, linePaddingLeftPx, linePaddingRightPx} =
    EDITOR_METRICS;
  return `${contentPaddingBlockPx}px ${linePaddingRightPx}px ${contentPaddingBlockPx}px ${linePaddingLeftPx}px`;
}
