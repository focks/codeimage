import {themeVars} from '@codeimage/ui';
import {style} from '@vanilla-extract/css';
import {THUMB_CARD_HEIGHT, THUMB_CARD_WIDTH} from './SlideThumbnail';

/**
 * The filmstrip sits at the bottom of the Canvas as a flow sibling of the
 * absolutely-positioned FrameToolbar (which has zIndex 40). Without its own
 * stacking context the toolbar's box overlaps the strip's top edge and, painting
 * above it, swallows real pointer clicks on the add/gear/action buttons. Giving
 * the strip `position: relative` + a higher zIndex lifts it above the toolbar so
 * clicks land. See punch-list item #1.
 */
export const filmstripWrapper = style({
  position: 'relative',
  zIndex: themeVars.zIndex['50'],
  display: 'flex',
  alignItems: 'center',
  gap: themeVars.spacing['3'],
  padding: `${themeVars.spacing['3']} ${themeVars.spacing['4']}`,
  overflowX: 'auto',
  overflowY: 'hidden',
  borderTop: `1px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.background,
  flexShrink: 0,
  minHeight: '84px',
  scrollBehavior: 'smooth',
  scrollbarWidth: 'thin',
  outline: 'none',
  selectors: {
    '&::-webkit-scrollbar': {
      height: '6px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: themeVars.dynamicColors.divider,
      borderRadius: '3px',
    },
  },
});

/** Applied while playback/export is running: dim + block interaction. */
export const filmstripDisabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
});

export const slideCard = style({
  position: 'relative',
  width: `${THUMB_CARD_WIDTH}px`,
  height: `${THUMB_CARD_HEIGHT}px`,
  borderRadius: '8px',
  border: `1.5px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  cursor: 'pointer',
  flexShrink: 0,
  overflow: 'hidden',
  padding: 0,
  // Animate the active-ring and add/remove/reorder settling.
  transition:
    'border-color .15s, box-shadow .15s, transform .18s ease, opacity .18s ease',
  selectors: {
    '&:hover': {
      borderColor: themeVars.dynamicColors.primary,
    },
  },
});

export const slideCardActive = style({
  borderColor: themeVars.dynamicColors.primary,
  boxShadow: `0 0 0 2px ${themeVars.dynamicColors.primary}`,
});

/** Slide-number badge pinned to the bottom-left corner of the card. */
export const slideNumber = style({
  position: 'absolute',
  bottom: '3px',
  left: '3px',
  minWidth: '15px',
  height: '15px',
  paddingLeft: '3px',
  paddingRight: '3px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: '1',
  color: '#fff',
  background: 'rgba(0, 0, 0, 0.55)',
  userSelect: 'none',
  pointerEvents: 'none',
});

/**
 * Compact action overlay across the top-right of a card. Hidden until the card
 * is hovered or one of its buttons is focused, so cards read as clean thumbnails
 * at rest.
 */
export const slideActions = style({
  position: 'absolute',
  top: '3px',
  right: '3px',
  display: 'flex',
  gap: '3px',
  padding: '2px',
  borderRadius: '6px',
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(4px)',
  opacity: 0,
  transform: 'translateY(-2px)',
  transition: 'opacity .12s ease, transform .12s ease',
  selectors: {
    [`${slideCard}:hover &`]: {
      opacity: 1,
      transform: 'translateY(0)',
    },
    '&:focus-within': {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
});

export const actionIconBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'rgba(255, 255, 255, 0.85)',
  padding: 0,
  transition: 'background .1s, color .1s',
  selectors: {
    '&:hover:not(:disabled)': {
      background: 'rgba(255, 255, 255, 0.18)',
      color: '#fff',
    },
    '&:disabled': {
      opacity: 0.35,
      cursor: 'not-allowed',
    },
  },
});

/** Add-slide card — dashed placeholder matching the thumbnail card footprint. */
export const addCard = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: `${THUMB_CARD_WIDTH}px`,
  height: `${THUMB_CARD_HEIGHT}px`,
  borderRadius: '8px',
  border: `1.5px dashed ${themeVars.dynamicColors.divider}`,
  cursor: 'pointer',
  flexShrink: 0,
  color: themeVars.dynamicColors.panel.textColorAlt,
  background: 'transparent',
  transition: 'border-color .15s, color .15s',
  selectors: {
    '&:hover': {
      borderColor: themeVars.dynamicColors.primary,
      color: themeVars.dynamicColors.primary,
    },
  },
});

export const reorderButtons = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  flexShrink: 0,
});

export const reorderButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '22px',
  borderRadius: '5px',
  border: `1px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  cursor: 'pointer',
  color: themeVars.dynamicColors.panel.textColorAlt,
  padding: 0,
  transition: 'opacity .12s, color .12s, border-color .12s',
  selectors: {
    '&:disabled': {
      opacity: 0.3,
      cursor: 'not-allowed',
    },
    '&:hover:not(:disabled)': {
      color: themeVars.dynamicColors.primary,
      borderColor: themeVars.dynamicColors.primary,
    },
  },
});

// ── Per-slide settings popover panel ────────────────────────────────────────
export const slideSettingsPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: themeVars.spacing['3'],
  padding: themeVars.spacing['2'],
  minWidth: '200px',
});

export const slideSettingsRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: themeVars.spacing['1'],
});

export const slideSettingsLabel = style({
  fontSize: themeVars.fontSize.xs,
  color: themeVars.dynamicColors.panel.textColorAlt,
  userSelect: 'none',
});
