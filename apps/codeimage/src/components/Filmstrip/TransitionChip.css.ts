import {themeVars} from '@codeimage/ui';
import {keyframes, style} from '@vanilla-extract/css';

/**
 * Canva-style transition UX styling: the small circular chips that live in the
 * gaps between filmstrip cards (and before the first card), the duration chip on
 * each card, the picker popover with its 5-option grid, and the CSS-keyframe mini
 * live previews that animate on hover. Everything is theme-token driven.
 */

// ── Transition chip (sits in the gap between two cards) ──────────────────────
export const chipSlot = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'center',
  // Narrow column that separates cards; the chip floats in its center.
  width: '20px',
  flexShrink: 0,
});

export const transitionChip = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  border: `1px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  color: themeVars.dynamicColors.panel.textColorAlt,
  cursor: 'pointer',
  padding: 0,
  // Subtle at rest so the strip reads as thumbnails; lifts on hover/open.
  opacity: 0.75,
  transition: 'opacity .12s ease, transform .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease',
  selectors: {
    '&:hover, &[data-expanded]': {
      opacity: 1,
      transform: 'scale(1.08)',
      borderColor: themeVars.dynamicColors.primary,
      color: themeVars.dynamicColors.primary,
      boxShadow: `0 2px 8px rgba(0,0,0,0.18)`,
    },
    '&:disabled': {
      opacity: 0.35,
      cursor: 'not-allowed',
    },
  },
});

/** Accent-tinted variant: this boundary OVERRIDES the global default. */
export const transitionChipOverridden = style({
  opacity: 1,
  borderColor: themeVars.dynamicColors.primary,
  color: themeVars.dynamicColors.primary,
  background: `color-mix(in srgb, ${themeVars.dynamicColors.primary} 14%, ${themeVars.dynamicColors.panel.background})`,
});

// ── Duration chip (on the thumbnail, bottom-right) ───────────────────────────
export const durationChip = style({
  position: 'absolute',
  bottom: '3px',
  right: '3px',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  height: '15px',
  paddingLeft: '3px',
  paddingRight: '4px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: '1',
  color: '#fff',
  background: 'rgba(0, 0, 0, 0.55)',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background .12s ease, box-shadow .12s ease',
  selectors: {
    '&:hover, &[data-expanded]': {
      background: 'rgba(0, 0, 0, 0.75)',
      boxShadow: `0 0 0 1.5px ${themeVars.dynamicColors.primary}`,
    },
  },
});

export const durationChipIcon = style({
  width: '10px',
  height: '10px',
  flexShrink: 0,
});

// ── Popover panels ───────────────────────────────────────────────────────────
export const pickerPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: themeVars.spacing['3'],
  padding: themeVars.spacing['2'],
  width: '256px',
});

export const durationPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: themeVars.spacing['2'],
  padding: themeVars.spacing['2'],
  width: '220px',
});

export const sectionLabel = style({
  fontSize: themeVars.fontSize.xs,
  fontWeight: 600,
  color: themeVars.dynamicColors.panel.textColor,
  userSelect: 'none',
});

export const fieldRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: themeVars.spacing['2'],
});

/** Native range input, themed to match the kit. */
export const rangeInput = style({
  flex: 1,
  height: '4px',
  appearance: 'none',
  WebkitAppearance: 'none',
  borderRadius: '2px',
  background: themeVars.dynamicColors.divider,
  cursor: 'pointer',
  outline: 'none',
  selectors: {
    '&::-webkit-slider-thumb': {
      WebkitAppearance: 'none',
      appearance: 'none',
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      background: themeVars.dynamicColors.primary,
      cursor: 'pointer',
      border: '2px solid #fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    },
    '&::-moz-range-thumb': {
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      background: themeVars.dynamicColors.primary,
      cursor: 'pointer',
      border: '2px solid #fff',
    },
  },
});

export const numericField = style({
  width: '64px',
  flexShrink: 0,
});

// ── 5-option transition grid ─────────────────────────────────────────────────
export const optionGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: themeVars.spacing['2'],
});

export const optionCard = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 4px',
  borderRadius: '8px',
  border: `1.5px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  color: themeVars.dynamicColors.panel.textColorAlt,
  cursor: 'pointer',
  transition: 'border-color .12s ease, color .12s ease, transform .12s ease',
  selectors: {
    '&:hover': {
      borderColor: themeVars.dynamicColors.primary,
      color: themeVars.dynamicColors.panel.textColor,
    },
  },
});

export const optionCardSelected = style({
  borderColor: themeVars.dynamicColors.primary,
  color: themeVars.dynamicColors.primary,
  boxShadow: `inset 0 0 0 1px ${themeVars.dynamicColors.primary}`,
});

export const optionLabel = style({
  fontSize: '10px',
  fontWeight: 600,
  lineHeight: '1',
  userSelect: 'none',
});

// ── Mini live preview (~64×36 stylized code-block mock) ──────────────────────
// Static at rest; the keyframe animations run only while the option card is
// hovered (Canva behavior). Pure CSS, cheap — three little "code" bars.
export const previewBox = style({
  position: 'relative',
  width: '58px',
  height: '34px',
  borderRadius: '5px',
  overflow: 'hidden',
  background: '#1e1e2e',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '3px',
  padding: '5px 6px',
});

export const previewBar = style({
  height: '3px',
  borderRadius: '2px',
  background: 'currentColor',
  opacity: 0.85,
});

// --- keyframes, one per mode ---
const fadeKf = keyframes({
  '0%, 100%': {opacity: 0.15},
  '50%': {opacity: 0.95},
});

const slideKf = keyframes({
  '0%': {transform: 'translateX(120%)', opacity: 0},
  '25%, 75%': {transform: 'translateX(0)', opacity: 0.9},
  '100%': {transform: 'translateX(-120%)', opacity: 0},
});

const morphKf = keyframes({
  '0%': {transform: 'translateY(60%) scaleX(0.6)', opacity: 0.2},
  '50%': {transform: 'translateY(0) scaleX(1)', opacity: 0.95},
  '100%': {transform: 'translateY(-60%) scaleX(0.6)', opacity: 0.2},
});

const typeKf = keyframes({
  '0%': {width: '0%'},
  '60%, 100%': {width: '100%'},
});

const noneKf = keyframes({
  '0%, 49%': {opacity: 0.2},
  '50%, 100%': {opacity: 0.95},
});

// Each mode's bars get a class; the animation is gated behind the card :hover.
function makeBarAnimation(kf: string, baseDelay = 0) {
  return style({
    selectors: {
      [`${optionCard}:hover &`]: {
        animation: `${kf} 1.6s ${baseDelay}s ease-in-out infinite`,
      },
    },
  });
}

export const barFade = makeBarAnimation(fadeKf);
export const barSlide = makeBarAnimation(slideKf);
export const barMorph = makeBarAnimation(morphKf);
export const barNone = makeBarAnimation(noneKf);

// Typewriter animates width (a growing bar) + a caret.
export const barType = style({
  width: '0%',
  selectors: {
    [`${optionCard}:hover &`]: {
      animation: `${typeKf} 1.6s ease-in-out infinite`,
    },
  },
});

// Stagger the three bars so the preview reads as a sequence, not a flash.
export const barDelay1 = style({selectors: {[`${optionCard}:hover &`]: {animationDelay: '0.08s'}}});
export const barDelay2 = style({selectors: {[`${optionCard}:hover &`]: {animationDelay: '0.16s'}}});

// ── Actions row (reset / apply-all) ──────────────────────────────────────────
export const actionsRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: themeVars.spacing['2'],
  marginTop: themeVars.spacing['1'],
});

export const textButton = style({
  border: 'none',
  background: 'transparent',
  color: themeVars.dynamicColors.panel.textColorAlt,
  fontSize: themeVars.fontSize.xs,
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: '5px',
  transition: 'color .1s ease, background .1s ease',
  selectors: {
    '&:hover:not(:disabled)': {
      color: themeVars.dynamicColors.panel.textColor,
      background: themeVars.dynamicColors.divider,
    },
    '&:disabled': {opacity: 0.4, cursor: 'not-allowed'},
  },
});

export const applyAllButton = style([
  textButton,
  {
    color: themeVars.dynamicColors.primary,
    fontWeight: 600,
  },
]);

export const hintText = style({
  fontSize: '11px',
  lineHeight: 1.35,
  color: themeVars.dynamicColors.panel.textColorAlt,
  userSelect: 'none',
  minHeight: '30px',
});
