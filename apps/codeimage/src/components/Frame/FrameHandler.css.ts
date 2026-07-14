import {themeVars, withThemeMode} from '@codeimage/ui';
import {createTheme, style} from '@vanilla-extract/css';

export const [frameHandler, frameHandlerVars] = createTheme({
  scale: '1',
  emptySquareBackgroundColor: '',
  borderRadius: themeVars.borderRadius.xl,
});

export const wrapper = style([
  frameHandler,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'grid',
    overflow: 'auto',
    flex: '1',
    placeItems: 'center',
    zIndex: 1,
    selectors: {
      ...withThemeMode({
        dark: {
          vars: {
            [frameHandlerVars.emptySquareBackgroundColor]: '#252525',
          },
        },
        light: {
          vars: {
            [frameHandlerVars.emptySquareBackgroundColor]:
              themeVars.backgroundColor.gray['300'],
          },
        },
      }),
    },
  },
]);

export const handler = style([
  {
    display: 'block',
    justifyContent: 'center',
    position: 'relative',
    transformOrigin: 'center',
    marginBottom: '80px',
  },
]);

export const content = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

/**
 * Small unobtrusive zoom indicator ("82%") pinned to the bottom-right of the
 * visible canvas area, shown only while the zoom-to-fit preview is active
 * (scale < 1). Follows the resize badge styling (dark pill, white text).
 */
export const scaleBadge = style({
  position: 'absolute',
  right: '12px',
  bottom: '12px',
  zIndex: 20,
  borderRadius: themeVars.borderRadius.lg,
  padding: '2px 8px',
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: '1.4',
  color: 'white',
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
  userSelect: 'none',
  pointerEvents: 'none',
});

export const squaredBackgroundOverlay = style({
  backgroundImage: `
    linear-gradient(45deg,  ${frameHandlerVars.emptySquareBackgroundColor} 25%,transparent 0),
    linear-gradient(-45deg, ${frameHandlerVars.emptySquareBackgroundColor} 25%,transparent 0),
    linear-gradient(45deg,transparent 75%, ${frameHandlerVars.emptySquareBackgroundColor} 0),
    linear-gradient(-45deg,transparent 75%, ${frameHandlerVars.emptySquareBackgroundColor} 0)
  `,
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0,0 10px, 10px -10px, -10px 0',
  zIndex: 1,
  position: 'absolute',
  width: '100%',
  height: '100%',
  borderRadius: frameHandlerVars.borderRadius,
});
