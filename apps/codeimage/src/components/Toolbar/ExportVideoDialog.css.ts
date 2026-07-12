import {themeVars} from '@codeimage/ui';
import {style} from '@vanilla-extract/css';

export const progressTrack = style({
  width: '100%',
  height: '8px',
  borderRadius: '4px',
  backgroundColor: themeVars.dynamicColors.divider,
  overflow: 'hidden',
});

export const progressFill = style({
  height: '100%',
  borderRadius: '4px',
  backgroundColor: themeVars.dynamicColors.primary,
  transition: 'width 80ms linear',
});

export const summaryRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
});
