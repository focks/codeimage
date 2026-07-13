import type {CustomTheme} from '@codeimage/highlight';
import {
  codeToKeyedTokens,
  type KeyedTokensInfo,
} from 'shiki-magic-move/core';
import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
  type HighlighterGeneric,
  type ThemeRegistration,
} from 'shiki';
import {buildShikiTheme, shikiThemeName} from './buildShikiTheme';
import {themeColorMap} from './themeColorMap';

/**
 * Runtime shiki themes generated from the ACTIVE codeimage theme's colors, so
 * playback highlighting matches the editor (problem P2). Previously this mapped
 * every theme to one of two vitesse bundles by light/dark, which was wrong for
 * the other ~26 codeimage themes. Now each codeimage theme id gets a shiki theme
 * built from its real HighlightStyle colors, cached and regenerated on switch.
 */

/**
 * Map a codeimage languageId to a shiki bundled language. Falls back through a
 * few common aliases, then to plain text so highlighting never throws.
 */
/** Sentinel for "no highlighting" — shiki accepts 'text'/'plaintext' at runtime. */
export const PLAIN_TEXT_LANG = 'text' as const;
export type ShikiLang = BundledLanguage | typeof PLAIN_TEXT_LANG;

export function shikiLangFor(languageId: string): ShikiLang {
  const id = languageId?.toLowerCase() ?? '';
  const alias: Record<string, BundledLanguage> = {
    // `.ts`/`.js` snippets frequently contain inline JSX (codeimage's default
    // snippet does). The plain typescript/javascript TextMate grammars mis-tokenize
    // JSX tags as type comparisons, tinting `<div>` like a keyword. The tsx/jsx
    // grammars are supersets that handle non-JSX code identically, so we always
    // use them — matching the editor's Lezer parser, which also understands JSX.
    typescript: 'tsx',
    ts: 'tsx',
    tsx: 'tsx',
    javascript: 'jsx',
    js: 'jsx',
    jsx: 'jsx',
    'c++': 'cpp',
    'c#': 'csharp',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    rs: 'rust',
    py: 'python',
  };
  if (id in alias) return alias[id];
  if (id in bundledLanguages) return id as BundledLanguage;
  return PLAIN_TEXT_LANG;
}

type Highlighter = HighlighterGeneric<BundledLanguage, string>;

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>();
/** Generated shiki themes keyed by codeimage theme id (regenerate on switch). */
const themeCache = new Map<string, ThemeRegistration>();

/**
 * Build (or read from cache) the shiki theme for a codeimage theme. Cached by the
 * theme's id so switching themes regenerates lazily and repeated frames reuse it.
 */
export function shikiThemeFor(theme: CustomTheme): ThemeRegistration {
  const cached = themeCache.get(theme.id);
  if (cached) return cached;
  const built = buildShikiTheme(theme.id, themeColorMap(theme));
  themeCache.set(theme.id, built);
  return built;
}

/** The shiki theme name for a codeimage theme (what `keyedTokensFor` needs). */
export function shikiThemeNameFor(theme: CustomTheme): string {
  return shikiThemeName(theme.id);
}

/** Test-only: drop cached generated themes so a rebuild is observable. */
export function __resetShikiThemeCache(): void {
  themeCache.clear();
}

/**
 * Lazily create a singleton shiki highlighter and ensure the requested langs +
 * runtime themes are loaded before use. Loading is idempotent and cached across
 * frames. Themes are custom `ThemeRegistration` objects (built per codeimage
 * theme); each is loaded once, keyed by its `name`.
 */
export async function ensureHighlighter(
  langs: readonly string[],
  themes: readonly ThemeRegistration[],
): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: [],
      themes: [],
    }) as Promise<Highlighter>;
  }
  const highlighter = await highlighterPromise;

  const missingLangs = langs
    .map(l => shikiLangFor(l))
    .filter(
      (l): l is BundledLanguage => l !== PLAIN_TEXT_LANG && !loadedLangs.has(l),
    );
  if (missingLangs.length > 0) {
    await highlighter.loadLanguage(
      ...missingLangs.map(l => bundledLanguages[l]),
    );
    missingLangs.forEach(l => loadedLangs.add(l));
  }

  const missingThemes = themes.filter(
    t => !!t.name && !loadedThemes.has(t.name),
  );
  if (missingThemes.length > 0) {
    await highlighter.loadTheme(...missingThemes);
    missingThemes.forEach(t => t.name && loadedThemes.add(t.name));
  }

  return highlighter;
}

/** Highlight code to keyed tokens for a slide (used by both typing + morph). */
export function keyedTokensFor(
  highlighter: Highlighter,
  code: string,
  languageId: string,
  themeName: string,
): KeyedTokensInfo {
  const lang = shikiLangFor(languageId);
  return codeToKeyedTokens(highlighter, code, {lang, theme: themeName});
}
