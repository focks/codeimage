import {style} from '@vanilla-extract/css';

// The animated code surface replaces the CodeMirror editor area during playback.
// It mimics the editor's left-aligned pre layout so the swap is not jarring.

export const surface = style({
  position: 'relative',
  // Width/height are set explicitly per frame from the ghost-measured slide box
  // (see boxSizing.ts): stable for the whole of a slide so the window does not
  // grow as text reveals (problem A), and eased between adjacent slide sizes during
  // a transition so the window morphs smoothly instead of snapping (problem B).
  // Falls back to intrinsic sizing until the ghosts have been measured.
  minHeight: '1em',
  textAlign: 'left',
  overflow: 'hidden',
});

// Off-screen measurement layer: renders a slide's FULL final code so its natural
// box can be observed, without contributing to the visible surface layout. One per
// slide; their measured sizes drive the surface box interpolation. Kept in-DOM (not
// display:none) so it has a real layout box, but visually hidden and pointer-inert.
export const measureLayer = style({
  position: 'absolute',
  left: 0,
  top: 0,
  margin: 0,
  whiteSpace: 'pre',
  textAlign: 'left',
  fontVariantLigatures: 'none',
  visibility: 'hidden',
  pointerEvents: 'none',
  // Take the layer out of the surface's own size calculation so it never inflates
  // the box it is being used to measure.
  zIndex: -1,
});

// Invisible in-flow ghost of the slide's full final code. Establishes the layout
// baseline inside the (already explicitly-sized) surface so the animated layers,
// which are absolutely positioned, have a consistent origin. visibility:hidden keeps
// its metrics identical to the painted text while contributing nothing visible.
export const ghostLayer = style({
  position: 'relative',
  margin: 0,
  whiteSpace: 'pre',
  textAlign: 'left',
  fontVariantLigatures: 'none',
  visibility: 'hidden',
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

// Static (typing / hold) render. Painted absolutely at the surface origin; the
// surface is explicitly sized from the ghost-measured slide box, so partial
// (typing) content no longer drives the window size (problem A).
export const staticLayer = style({
  position: 'absolute',
  inset: 0,
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
