import {
  codeToKeyedTokens,
  type KeyedTokensInfo,
} from 'shiki-magic-move/core';
import {
  bundledLanguages,
  bundledThemes,
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type HighlighterGeneric,
} from 'shiki';

// ponytail: exact codeimage-theme parity comes later. For v1 we map the current
// theme to one reasonable shiki built-in by light/dark and call it good.
const LIGHT_THEME: BundledTheme = 'vitesse-light';
const DARK_THEME: BundledTheme = 'vitesse-dark';

export function shikiThemeFor(isDark: boolean): BundledTheme {
  return isDark ? DARK_THEME : LIGHT_THEME;
}

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
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
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

type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>;

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>();

/**
 * Lazily create a singleton shiki highlighter and ensure the requested lang +
 * theme are loaded before use. Loading is idempotent and cached across frames.
 */
export async function ensureHighlighter(
  langs: readonly string[],
  themes: readonly BundledTheme[],
): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: [],
      themes: [LIGHT_THEME, DARK_THEME],
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

  const missingThemes = themes.filter(t => !loadedThemes.has(t));
  if (missingThemes.length > 0) {
    await highlighter.loadTheme(...missingThemes.map(t => bundledThemes[t]));
    missingThemes.forEach(t => loadedThemes.add(t));
  }

  return highlighter;
}

/** Highlight code to keyed tokens for a slide (used by both typing + morph). */
export function keyedTokensFor(
  highlighter: Highlighter,
  code: string,
  languageId: string,
  theme: BundledTheme,
): KeyedTokensInfo {
  const lang = shikiLangFor(languageId);
  return codeToKeyedTokens(highlighter, code, {lang, theme});
}
