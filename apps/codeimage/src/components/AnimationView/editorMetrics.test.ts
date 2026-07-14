import {describe, expect, it} from 'vitest';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  editorMetrics,
  EDITOR_METRICS,
  lineBoxHeightPx,
  surfacePadding,
} from './editorMetrics';

describe('editorMetrics', () => {
  it('uses the given font size verbatim', () => {
    expect(editorMetrics(12).fontSizePx).toBe(12);
    expect(editorMetrics(16).fontSizePx).toBe(16);
    expect(editorMetrics(24).fontSizePx).toBe(24);
    expect(editorMetrics(28).fontSizePx).toBe(28);
  });

  it('keeps line-height a constant unitless 1.4 ratio at every size', () => {
    // Measured in-browser: the .cm-line box is font-size * 1.4 at each size, and
    // the ratio itself (the unitless line-height) does not change with size.
    for (const size of [12, 14, 16, 18, 20, 24, 28]) {
      expect(editorMetrics(size).lineHeight).toBe(1.4);
    }
  });

  it('keeps content + line paddings fixed (font-size independent)', () => {
    for (const size of [12, 16, 24]) {
      const m = editorMetrics(size);
      expect(m.contentPaddingBlockPx).toBe(4);
      expect(m.linePaddingLeftPx).toBe(8);
      expect(m.linePaddingRightPx).toBe(2);
      expect(m.tabSize).toBe(4);
    }
  });

  it('falls back to the 16px default for non-finite/non-positive input', () => {
    expect(editorMetrics(0).fontSizePx).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(editorMetrics(-5).fontSizePx).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(editorMetrics(NaN).fontSizePx).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(editorMetrics(Infinity).fontSizePx).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });
});

describe('lineBoxHeightPx', () => {
  it('is exactly font-size * 1.4 — matches the measured CodeMirror line box', () => {
    // These are the exact numbers measured from the live editor DOM.
    expect(lineBoxHeightPx(12)).toBeCloseTo(16.8, 5);
    expect(lineBoxHeightPx(14)).toBeCloseTo(19.6, 5);
    expect(lineBoxHeightPx(16)).toBeCloseTo(22.4, 5);
    expect(lineBoxHeightPx(18)).toBeCloseTo(25.2, 5);
    expect(lineBoxHeightPx(20)).toBeCloseTo(28.0, 5);
    expect(lineBoxHeightPx(24)).toBeCloseTo(33.6, 5);
    expect(lineBoxHeightPx(28)).toBeCloseTo(39.2, 5);
  });
});

describe('EDITOR_METRICS default', () => {
  it('mirrors the 16px editor default', () => {
    expect(EDITOR_METRICS.fontSizePx).toBe(16);
    expect(EDITOR_METRICS.lineHeight).toBe(1.4);
  });
});

describe('surfacePadding', () => {
  it('mirrors the editor content + line padding shorthand (fixed at all sizes)', () => {
    // top/bottom = content pad (4), right = line right pad (2), left = line left (8).
    expect(surfacePadding()).toBe('4px 2px 4px 8px');
  });
});
