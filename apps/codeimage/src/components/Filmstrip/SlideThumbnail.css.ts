import {themeVars} from '@codeimage/ui';
import {style} from '@vanilla-extract/css';

// Virtual stage size (before scale). We render the mini frame at a comfortable
// size and shrink it with a CSS transform so the tiny code text stays crisp
// instead of blurring at sub-pixel font sizes.
export const STAGE_WIDTH = 320;
export const STAGE_HEIGHT = 200;

/** Fixed card-sized clipping box that the scaled stage lives inside. */
export const thumbnail = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  borderRadius: '5px',
  pointerEvents: 'none',
  userSelect: 'none',
});

export const stage = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: `${STAGE_WIDTH}px`,
  height: `${STAGE_HEIGHT}px`,
  transformOrigin: 'top left',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

/** The padded backdrop (the frame background: gradient / solid / image). */
export const backdrop = style({
  position: 'absolute',
  inset: 0,
});

/** The window/terminal body sitting on the backdrop. */
export const window = style({
  position: 'relative',
  width: '80%',
  borderRadius: '10px',
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '26px',
  paddingLeft: '12px',
  flexShrink: 0,
});

export const dot = style({
  width: '9px',
  height: '9px',
  borderRadius: '50%',
});

export const codeArea = style({
  padding: '10px 12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  overflow: 'hidden',
});

export const codeLine = style({
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: '9px',
  lineHeight: '1',
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'clip',
});

/** Neutral placeholder bar for slides that have no code, so cards never look broken. */
export const emptyBar = style({
  height: '5px',
  borderRadius: '2px',
  background: themeVars.dynamicColors.divider,
  opacity: 0.4,
});
