import {themeVars} from '@codeimage/ui';
import {style} from '@vanilla-extract/css';

export const filmstripWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: themeVars.spacing['2'],
  padding: `${themeVars.spacing['2']} ${themeVars.spacing['4']}`,
  overflowX: 'auto',
  borderTop: `1px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.background,
  flexShrink: 0,
  minHeight: '72px',
});

export const slideCard = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '80px',
  height: '52px',
  borderRadius: '8px',
  border: `1.5px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'border-color .15s, box-shadow .15s',
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

export const slideNumber = style({
  fontSize: themeVars.fontSize.xs,
  color: themeVars.dynamicColors.panel.textColorAlt,
  userSelect: 'none',
  lineHeight: '1',
});

export const slideActions = style({
  position: 'absolute',
  top: '2px',
  right: '2px',
  display: 'flex',
  gap: '2px',
  opacity: 0,
  transition: 'opacity .12s',
  selectors: {
    [`${slideCard}:hover &`]: {
      opacity: 1,
    },
    [`${slideCardActive} &`]: {
      opacity: 1,
    },
  },
});

export const addCard = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '80px',
  height: '52px',
  borderRadius: '8px',
  border: `1.5px dashed ${themeVars.dynamicColors.divider}`,
  cursor: 'pointer',
  flexShrink: 0,
  fontSize: '20px',
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

export const actionIconBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '4px',
  border: 'none',
  background: themeVars.dynamicColors.panel.background,
  cursor: 'pointer',
  color: themeVars.dynamicColors.panel.textColorAlt,
  fontSize: '10px',
  padding: 0,
  selectors: {
    '&:hover': {
      color: themeVars.dynamicColors.primary,
    },
  },
});

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

export const reorderButtons = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  paddingLeft: themeVars.spacing['1'],
  flexShrink: 0,
});

export const reorderButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: '4px',
  border: `1px solid ${themeVars.dynamicColors.divider}`,
  background: themeVars.dynamicColors.panel.background,
  cursor: 'pointer',
  color: themeVars.dynamicColors.panel.textColorAlt,
  fontSize: '10px',
  padding: 0,
  transition: 'opacity .12s',
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
