import {describe, expect, it} from 'vitest';
import {
  draculaTheme,
  fleetDarkTheme,
  githubDarkTheme,
} from '@codeimage/highlight/themes';
import {buildShikiTheme, shikiThemeName} from './buildShikiTheme';
import {
  collectHighlightStyles,
  themeColorMap,
  type ThemeColorMap,
} from './themeColorMap';

const HEX = /^#[0-9a-fA-F]{3,8}$/;

describe('collectHighlightStyles', () => {
  it('finds the HighlightStyle(s) inside a theme editorTheme extension', () => {
    expect(collectHighlightStyles(fleetDarkTheme.editorTheme).length).toBeGreaterThan(0);
    expect(collectHighlightStyles(draculaTheme.editorTheme).length).toBeGreaterThan(0);
  });
});

describe('themeColorMap', () => {
  it('extracts a well-formed dominant-color map for fleetDark', () => {
    const map = themeColorMap(fleetDarkTheme);
    expect(map.dark).toBe(true);
    // Background from the theme's root editor rule.
    expect(map.background).toBe('#181818');
    // fleetDark's known palette colors.
    expect(map.keyword).toBe('#82d2ce');
    expect(map.string).toBe('#E394DC');
    expect(map.comment).toBe('#898989');
    expect(map.number).toBe('#EBC88D');
  });

  it('extracts a real (non-fallback) foreground', () => {
    // Regression: the base-color regex must match CodeMirror's non-ASCII class
    // names, otherwise foreground silently falls back to a neutral grey.
    const map = themeColorMap(fleetDarkTheme);
    expect(map.foreground).toBe('#d1d1d1');
    expect(map.foreground).not.toBe('#d4d4d4'); // the dark fallback
  });

  it('always yields a parseable background + foreground for every theme', () => {
    for (const theme of [fleetDarkTheme, draculaTheme, githubDarkTheme]) {
      const map = themeColorMap(theme);
      expect(map.background).toMatch(HEX);
      expect(map.foreground).toMatch(HEX);
    }
  });

  it('is deterministic (same theme -> identical map)', () => {
    expect(themeColorMap(draculaTheme)).toEqual(themeColorMap(draculaTheme));
  });

  it('exposes the dominant token classes the shiki builder consumes', () => {
    const map = themeColorMap(githubDarkTheme);
    const dominant: (keyof ThemeColorMap)[] = [
      'keyword',
      'string',
      'comment',
      'number',
      'function',
      'type',
    ];
    for (const key of dominant) {
      const value = map[key];
      if (value != null) expect(String(value)).toMatch(HEX);
    }
  });
});

describe('buildShikiTheme', () => {
  it('produces a valid shiki ThemeRegistration shape', () => {
    const map = themeColorMap(fleetDarkTheme);
    const theme = buildShikiTheme(fleetDarkTheme.id, map);
    expect(theme.name).toBe(shikiThemeName('fleetDark'));
    expect(theme.type).toBe('dark');
    expect(theme.fg).toBe(map.foreground);
    expect(theme.bg).toBe(map.background);
    expect(theme.colors?.['editor.background']).toBe(map.background);
    expect(Array.isArray(theme.settings)).toBe(true);
    // First rule is the default-foreground fallback (empty scope).
    expect(theme.settings?.[0]).toEqual({
      scope: [],
      settings: {foreground: map.foreground},
    });
  });

  it('emits a settings entry per defined dominant color, each with scopes', () => {
    const map = themeColorMap(draculaTheme);
    const theme = buildShikiTheme(draculaTheme.id, map);
    const nonDefault = (theme.settings ?? []).slice(1);
    expect(nonDefault.length).toBeGreaterThan(0);
    for (const setting of nonDefault) {
      expect(Array.isArray(setting.scope)).toBe(true);
      expect((setting.scope as string[]).length).toBeGreaterThan(0);
      expect(setting.settings.foreground).toMatch(HEX);
    }
  });

  it('names themes 1:1 with the codeimage theme id (cache key stability)', () => {
    expect(shikiThemeName('dracula')).toBe('codeimage-dracula');
    expect(shikiThemeName('githubDark')).toBe('codeimage-githubDark');
  });
});
