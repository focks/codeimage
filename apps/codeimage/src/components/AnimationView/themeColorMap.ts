import type {CustomTheme} from '@codeimage/highlight';
import {HighlightStyle} from '@codemirror/language';
import type {Extension} from '@codemirror/state';
import {tags as t, type Tag} from '@lezer/highlight';

/**
 * Extract the dominant syntax colors from a codeimage theme's CodeMirror
 * `editorTheme` so playback (shiki) can be tinted to match the editor exactly
 * (problem P2). Two facts make this reliable without touching the DOM:
 *
 *   1. Every theme's syntax colors live in one or more `HighlightStyle` instances
 *      reachable inside `editorTheme` (both the `defineEditorTheme` helper and the
 *      few hand-written themes end up there). `HighlightStyle.specs` preserves the
 *      exact `Tag` objects from `@lezer/highlight`, so matching by object identity
 *      is exact.
 *   2. The default foreground + editor background are declared on the root style
 *      rule of the theme's `EditorView.theme({'&': {color, background}})`, which we
 *      read from the compiled StyleModule's CSS rules; background also falls back
 *      to the theme's terminal color.
 *
 * The map is intentionally scoped to the DOMINANT token classes (keyword, string,
 * comment, number, function, variable, type, operator, punctuation, property,
 * plus background + default foreground). Perfect per-scope parity with the editor
 * grammar is out of scope — this targets what a viewer actually perceives.
 */

/** The dominant token classes we map from codeimage themes onto shiki scopes. */
export interface ThemeColorMap {
  /** Editor background. */
  readonly background: string;
  /** Default text color (unclassified tokens). */
  readonly foreground: string;
  readonly keyword?: string;
  readonly string?: string;
  readonly comment?: string;
  readonly number?: string;
  readonly function?: string;
  readonly variable?: string;
  readonly type?: string;
  readonly operator?: string;
  readonly punctuation?: string;
  readonly property?: string;
  readonly class?: string;
  readonly boolean?: string;
  readonly regexp?: string;
  readonly tagName?: string;
  readonly attribute?: string;
  /** True when the source theme declares itself dark (drives shiki `type`). */
  readonly dark: boolean;
}

/** Neutral fallbacks so a partially-defined theme never yields empty colors. */
const FALLBACK_DARK = {background: '#0d0d0d', foreground: '#d4d4d4'} as const;
const FALLBACK_LIGHT = {background: '#ffffff', foreground: '#24292e'} as const;

/**
 * Walk an arbitrary CodeMirror `Extension` tree collecting every `HighlightStyle`
 * instance. Extensions are opaque nested arrays/objects; a cycle-guarded DFS finds
 * the styles wherever `syntaxHighlighting()` tucked them.
 */
export function collectHighlightStyles(
  ext: Extension | unknown,
  out: HighlightStyle[] = [],
  seen: Set<unknown> = new Set(),
): HighlightStyle[] {
  if (ext == null || typeof ext !== 'object') return out;
  if (seen.has(ext)) return out;
  seen.add(ext);
  if (ext instanceof HighlightStyle) {
    out.push(ext);
    return out;
  }
  if (Array.isArray(ext)) {
    for (const child of ext) collectHighlightStyles(child, out, seen);
    return out;
  }
  for (const value of Object.values(ext as Record<string, unknown>)) {
    collectHighlightStyles(value, out, seen);
  }
  return out;
}

/**
 * First `color` found for any of the given tags across all styles. Tags are
 * matched by object identity against each spec's `tag` (a `Tag` or `Tag[]`).
 * Earlier styles win, mirroring CodeMirror's precedence (later `syntaxHighlighting`
 * overrides, but for our purposes any concrete color is representative).
 */
export function colorForTags(
  styles: readonly HighlightStyle[],
  wanted: readonly Tag[],
): string | undefined {
  for (const style of styles) {
    for (const spec of style.specs) {
      const specTags = Array.isArray(spec.tag) ? spec.tag : [spec.tag];
      if (specTags.some(tag => wanted.includes(tag)) && spec.color) {
        return spec.color as string;
      }
    }
  }
  return undefined;
}

/**
 * Pull the editor's default foreground + background out of the theme's compiled
 * `EditorView.theme` StyleModule. The root rule (a class-only selector — the one
 * `&` compiles to) carries `color` and often `background`.
 */
export function readBaseColors(ext: Extension | unknown): {
  foreground?: string;
  background?: string;
} {
  const modules = collectStyleModules(ext);
  let css = '';
  for (const mod of modules) {
    try {
      css += (mod as {getRules(): string}).getRules() + '\n';
    } catch {
      /* a StyleModule without getRules — skip it */
    }
  }
  // The root editor rule is a single generated class with no descendant
  // combinator, e.g. `.ͼ8l {color: #d1d1d1; background: #181818;}`. CodeMirror's
  // generated class names use non-ASCII code points, so match "a dot, then any
  // run of non-space/brace chars, then a brace" rather than `[\w-]`.
  const rootRule = css.match(/\.[^\s{},]+\s*\{([^}]*)\}/);
  const block = rootRule?.[1] ?? '';
  const foreground = block.match(/(?:^|;)\s*color:\s*([^;]+)/i)?.[1]?.trim();
  const background = block
    .match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/i)?.[1]
    ?.trim();
  return {foreground, background};
}

/** Collect StyleModule instances (they expose `getRules()`) from an Extension. */
function collectStyleModules(
  ext: Extension | unknown,
  out: unknown[] = [],
  seen: Set<unknown> = new Set(),
): unknown[] {
  if (ext == null || typeof ext !== 'object') return out;
  if (seen.has(ext)) return out;
  seen.add(ext);
  if (typeof (ext as {getRules?: unknown}).getRules === 'function') {
    out.push(ext);
    return out;
  }
  if (Array.isArray(ext)) {
    for (const child of ext) collectStyleModules(child, out, seen);
    return out;
  }
  for (const value of Object.values(ext as Record<string, unknown>)) {
    collectStyleModules(value, out, seen);
  }
  return out;
}

/**
 * Build a dominant-color map from a codeimage theme. Deterministic and DOM-free:
 * identical theme input always yields identical colors.
 */
export function themeColorMap(theme: CustomTheme): ThemeColorMap {
  const dark = theme.properties.darkMode;
  const fallback = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  const styles = collectHighlightStyles(theme.editorTheme);
  const base = readBaseColors(theme.editorTheme);

  // Background: root-rule background -> theme terminal main -> neutral fallback.
  const background =
    base.background ?? theme.properties.terminal?.main ?? fallback.background;
  const foreground = base.foreground ?? fallback.foreground;

  // Tag variants: themes wrap variableName/propertyName in local()/definition()/
  // function() modifiers, so we probe the common wrappers for each class.
  const pick = (...tags: Tag[]) => colorForTags(styles, tags);

  return {
    dark,
    background,
    foreground,
    keyword: pick(t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword),
    string: pick(t.string, t.special(t.string)),
    comment: pick(t.comment, t.lineComment, t.blockComment),
    number: pick(t.number, t.integer, t.float),
    function: pick(
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
    ),
    variable: pick(
      t.variableName,
      t.local(t.variableName),
      t.definition(t.variableName),
      t.special(t.variableName),
    ),
    type: pick(t.typeName, t.definition(t.typeName), t.typeOperator),
    operator: pick(t.operator, t.arithmeticOperator, t.logicOperator),
    punctuation: pick(t.punctuation, t.separator, t.derefOperator),
    property: pick(t.propertyName, t.definition(t.propertyName)),
    class: pick(t.className, t.definition(t.className)),
    boolean: pick(t.bool, t.atom),
    regexp: pick(t.regexp),
    tagName: pick(t.tagName),
    attribute: pick(t.attributeName, t.attributeValue),
  };
}
