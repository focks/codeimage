import type {ThemeRegistration} from 'shiki';
import type {ThemeColorMap} from './themeColorMap';

/**
 * Turn a codeimage {@link ThemeColorMap} into a shiki textmate theme so playback
 * highlighting matches the editor's colors (problem P2). We map each dominant
 * token class to the TextMate scopes shiki's grammars emit for it. Scope parity
 * is necessarily approximate — grammars label tokens with many fine-grained
 * scopes — so we target the broad scopes that carry the perceived color:
 * keywords, strings, comments, numbers, functions, types, variables, operators,
 * punctuation and properties, over the theme's background + default foreground.
 *
 * Any class the source theme leaves undefined simply contributes no setting and
 * inherits the default foreground, which is the correct graceful degradation.
 */

interface ScopeSetting {
  readonly scope: string[];
  readonly settings: {foreground: string};
}

/** TextMate scopes that carry each dominant color, in shiki's grammars. */
const SCOPE_GROUPS: ReadonlyArray<{
  key: keyof ThemeColorMap;
  scopes: string[];
}> = [
  {
    key: 'comment',
    scopes: ['comment', 'punctuation.definition.comment', 'string.comment'],
  },
  {
    key: 'string',
    scopes: [
      'string',
      'string.quoted',
      'string.template',
      'punctuation.definition.string',
      'meta.embedded.string',
    ],
  },
  {
    key: 'regexp',
    scopes: ['string.regexp', 'constant.regexp'],
  },
  {
    key: 'keyword',
    scopes: [
      'keyword',
      'keyword.control',
      'keyword.operator.new',
      'keyword.operator.expression',
      'storage',
      'storage.type',
      'storage.modifier',
      'modifier',
    ],
  },
  {
    key: 'operator',
    scopes: ['keyword.operator', 'punctuation.accessor', 'keyword.operator.assignment'],
  },
  {
    key: 'number',
    scopes: ['constant.numeric', 'constant.language', 'constant.character.numeric'],
  },
  {
    key: 'boolean',
    scopes: ['constant.language.boolean', 'constant.language.null', 'constant.language.undefined'],
  },
  {
    key: 'function',
    scopes: [
      'entity.name.function',
      'support.function',
      'meta.function-call',
      'variable.function',
      'entity.name.method',
    ],
  },
  {
    key: 'type',
    scopes: [
      'entity.name.type',
      'support.type',
      'entity.name.type.class',
      'entity.other.inherited-class',
      'support.class',
    ],
  },
  {
    key: 'class',
    scopes: ['entity.name.class', 'support.class', 'entity.name.type.class'],
  },
  {
    key: 'property',
    scopes: [
      'variable.other.property',
      'meta.object-literal.key',
      'support.type.property-name',
      'variable.other.object.property',
    ],
  },
  {
    key: 'variable',
    scopes: [
      'variable',
      'variable.other',
      'variable.other.readwrite',
      // `const`/destructured bindings are `variable.other.constant` in TextMate;
      // codeimage's editor renders them as plain variables, so map them here
      // rather than let them inherit the numeric-constant color.
      'variable.other.constant',
      'meta.definition.variable',
    ],
  },
  {
    key: 'tagName',
    scopes: ['entity.name.tag', 'support.class.component'],
  },
  {
    key: 'attribute',
    scopes: ['entity.other.attribute-name', 'meta.attribute'],
  },
  {
    key: 'punctuation',
    scopes: [
      'punctuation',
      'punctuation.separator',
      'punctuation.terminator',
      'punctuation.definition.tag',
      'meta.brace',
      // TextMate labels the fat-arrow `=>` as storage; codeimage's editor renders
      // it as plain punctuation, so pin it to the punctuation color to match. This
      // more-specific scope wins over the broad `storage` keyword rule.
      'storage.type.function.arrow',
    ],
  },
];

/**
 * A stable, deterministic shiki theme name for a codeimage theme id. Shiki caches
 * loaded themes by name, so this must be 1:1 with the theme id.
 */
export function shikiThemeName(themeId: string): string {
  return `codeimage-${themeId}`;
}

/**
 * Build a shiki `ThemeRegistration` from a color map. Pure function of its input:
 * the same map always yields the same theme object (safe to cache per theme id).
 */
export function buildShikiTheme(
  themeId: string,
  colors: ThemeColorMap,
): ThemeRegistration {
  const settings: ScopeSetting[] = [];
  for (const group of SCOPE_GROUPS) {
    const color = colors[group.key];
    if (typeof color === 'string' && color.length > 0) {
      settings.push({scope: group.scopes, settings: {foreground: color}});
    }
  }

  return {
    name: shikiThemeName(themeId),
    type: colors.dark ? 'dark' : 'light',
    fg: colors.foreground,
    bg: colors.background,
    colors: {
      'editor.foreground': colors.foreground,
      'editor.background': colors.background,
    },
    settings: [
      // A default rule so unmatched tokens read the theme's foreground, not
      // shiki's built-in default (which would be a subtle mismatch).
      {scope: [], settings: {foreground: colors.foreground}},
      ...settings,
    ],
  };
}
