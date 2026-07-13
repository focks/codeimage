/**
 * Font/box metrics of the live CodeMirror editor, mirrored so the AnimationView
 * playback surface lays code out identically. When ManagedFrame swaps
 * CanvasEditor -> AnimationView on Play, any metric drift shifts the whole code
 * block (problem P1). These constants are the ground truth read from the rendered
 * editor DOM (`.cm-content` / `.cm-line`) and CodeMirror's base theme:
 *
 *   - font-size:   16px   (CM default; the editor exposes no font-size option)
 *   - line-height: 22.4px (16 * 1.4 — the computed line box of `.cm-content`)
 *   - content pad:  4px 0 (CodeMirror `.cm-content` vertical padding)
 *   - line pad:    0 2px 0 8px (CustomEditor override of the CM `.cm-line` pad)
 *   - tab-size:    4      (CM default)
 *
 * Font family + weight are still read live from the editor store (they ARE user
 * options); everything here is fixed by the editor's own CSS, so mirroring the
 * exact numbers keeps the swap pixel-stable without racing a DOM measurement.
 */
export const EDITOR_METRICS = {
  /** Rendered font size of a code glyph, in px. */
  fontSizePx: 16,
  /** Unitless line-height multiplier (16px * 1.4 = 22.4px line box). */
  lineHeight: 1.4,
  /** `.cm-content` vertical padding (top === bottom), in px. */
  contentPaddingBlockPx: 4,
  /** `.cm-line` left padding (CustomEditor override), in px. */
  linePaddingLeftPx: 8,
  /** `.cm-line` right padding, in px. */
  linePaddingRightPx: 2,
  /** `tab-size` of the code content. */
  tabSize: 4,
} as const;

/** The `padding` shorthand mirroring the editor's content + line box padding. */
export function surfacePadding(): string {
  const {contentPaddingBlockPx, linePaddingLeftPx, linePaddingRightPx} =
    EDITOR_METRICS;
  return `${contentPaddingBlockPx}px ${linePaddingRightPx}px ${contentPaddingBlockPx}px ${linePaddingLeftPx}px`;
}
