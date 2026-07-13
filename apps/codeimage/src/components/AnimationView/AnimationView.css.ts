import {style} from '@vanilla-extract/css';

// The animated code surface replaces the CodeMirror editor area during playback.
// It mimics the editor's left-aligned pre layout so the swap is not jarring.

export const surface = style({
  position: 'relative',
  width: '100%',
  minHeight: '1em',
  textAlign: 'left',
  overflow: 'hidden',
});

export const layer = style({
  position: 'absolute',
  inset: 0,
  margin: 0,
  whiteSpace: 'pre',
  textAlign: 'left',
  fontVariantLigatures: 'none',
  willChange: 'opacity, transform',
});

// Static (typing / hold) render uses in-flow layout so height drives the frame.
export const staticLayer = style({
  position: 'relative',
  margin: 0,
  whiteSpace: 'pre',
  textAlign: 'left',
  fontVariantLigatures: 'none',
});

export const token = style({
  display: 'inline',
  whiteSpace: 'pre',
});

// One line in the line-based `slide` transition. Each line is its own block so
// it can be offset horizontally independent of the others.
export const slideLineLayer = style({
  position: 'absolute',
  inset: 0,
  margin: 0,
  textAlign: 'left',
  fontVariantLigatures: 'none',
  willChange: 'transform, opacity',
});

export const slideLine = style({
  display: 'block',
  whiteSpace: 'pre',
  willChange: 'transform, opacity',
});

// Caret shown at the end of the typed prefix. Its blink is driven by an inline,
// progress-derived opacity (see `caretOpacity`) rather than a CSS animation, so it
// stays a deterministic pure function of the injected time — required for
// seek-exact video export. The static opacity here is just a fallback.
export const caret = style({
  display: 'inline-block',
  width: '2px',
  height: '1em',
  marginLeft: '1px',
  verticalAlign: 'text-bottom',
  background: 'currentColor',
  animation: 'none',
  opacity: 0.85,
});
