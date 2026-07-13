import type {KeyedToken, KeyedTokensInfo} from 'shiki-magic-move/core';
import {easeInOutCubic, easeOutCubic} from '../../state/playback/easing';
import {typedCharCount} from '../../state/playback/timeline';
import {diffLines} from './lineDiff';

/**
 * Pure token-layout helpers for the animation view. Everything here is a pure
 * function of its inputs (and, where relevant, `progress`) so the rendered frame
 * at any time is reproducible — the invariant phase 3 relies on for export.
 */

export interface RenderToken {
  readonly key: string;
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
  /** 0..1 opacity for the token at the current progress. */
  readonly opacity: number;
  /** True for a hard line break (rendered as a block break, not a span). */
  readonly isNewline: boolean;
}

function toRenderToken(
  token: KeyedToken,
  opacity: number,
): RenderToken {
  return {
    key: token.key,
    content: token.content,
    color: token.color,
    fontStyle: token.fontStyle,
    opacity,
    isNewline: token.content === '\n',
  };
}

/**
 * Return a referentially STABLE token list: any token whose visible fields
 * (`content`/`color`/`opacity`/`fontStyle`/`isNewline`) are unchanged from the
 * previous call for the same `key` reuses the prior object reference. Solid's
 * `<For>` reconciles by reference, so feeding it stable references lets it reuse
 * the existing DOM rows and touch only the rows that actually changed — turning a
 * typing reveal (which appends ~1 token per frame) from an O(all tokens) re-map
 * into an O(changed tokens) patch. Pure w.r.t. its inputs: the `cache` map is the
 * only mutable state and is owned by the caller (one per rendered layer), so the
 * token-producing functions above stay pure and export stays seek-exact (identical
 * inputs still yield value-identical output; only object identity is deduplicated).
 */
export function stabilizeTokens(
  tokens: RenderToken[],
  cache: Map<string, RenderToken>,
): RenderToken[] {
  const out: RenderToken[] = new Array(tokens.length);
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Two tokens can share a key across from/to layers, and a typing prefix can
    // repeat a key with a shorter content slice; disambiguate by index so the
    // cache never collapses distinct positions.
    const id = `${i}:${t.key}`;
    seen.add(id);
    const prev = cache.get(id);
    if (
      prev &&
      prev.content === t.content &&
      prev.color === t.color &&
      prev.opacity === t.opacity &&
      prev.fontStyle === t.fontStyle &&
      prev.isNewline === t.isNewline
    ) {
      out[i] = prev;
    } else {
      cache.set(id, t);
      out[i] = t;
    }
  }
  // Evict cache entries that are no longer present so a shrinking list (e.g. a
  // clear beat) does not leak references.
  if (cache.size > seen.size) {
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id);
  }
  return out;
}

/**
 * Typing reveal: show the first `n = floor(progress * totalChars)` characters of
 * the code, where `totalChars` counts every character including newlines. Purely
 * a function of progress, so seeking to any time yields the exact same reveal.
 */
export function revealTypedTokens(
  info: KeyedTokensInfo,
  progress: number,
): RenderToken[] {
  const totalChars = info.code.length;
  const revealCount = typedCharCount(totalChars, progress);

  const out: RenderToken[] = [];
  let consumed = 0;

  for (const token of info.tokens) {
    if (consumed >= revealCount) break;
    const remaining = revealCount - consumed;
    if (token.content.length <= remaining) {
      out.push(toRenderToken(token, 1));
      consumed += token.content.length;
    } else {
      // Partial token: reveal only the leading slice.
      out.push(
        toRenderToken(
          {...token, content: token.content.slice(0, remaining)},
          1,
        ),
      );
      consumed = revealCount;
      break;
    }
  }

  return out;
}

/**
 * Deterministic caret opacity for the typewriter entry. The typing reveal itself
 * stays linear (typing is inherently linear), but the caret blinks so it reads as
 * a live cursor rather than a static bar. Modelled as a square wave of the number
 * of characters "typed so far" (`progress × charCount`), toggling every
 * `blinkPeriodChars` characters — a pure function of progress, so a given time
 * always yields the same caret and export stays seek-exact.
 */
export function caretOpacity(
  progress: number,
  charCount: number,
  blinkPeriodChars = 6,
): number {
  const period = Math.max(1, blinkPeriodChars);
  const typed = Math.max(0, progress) * Math.max(0, charCount);
  // Square wave: on for the first half of each period, off for the second.
  const phase = Math.floor(typed / period) % 2;
  return phase === 0 ? 1 : 0.25;
}

/** All tokens fully visible (steady-state hold render). */
export function fullTokens(info: KeyedTokensInfo): RenderToken[] {
  return info.tokens.map(token => toRenderToken(token, 1));
}

export interface MorphLayer {
  readonly tokens: RenderToken[];
  /** Container opacity for this layer at the current progress. */
  readonly opacity: number;
  /** Vertical offset (px-independent ratio, multiply by lineHeight at render). */
  readonly translateYLines: number;
}

/**
 * Cross-dissolve morph between two keyed token sets, driven purely by `progress`.
 *
 * `from`/`to` must have had their keys synced (via `syncTokenKeys`) so matched
 * tokens carry identical keys. Matched tokens are held visible in both layers
 * (they read as "staying"); unmatched tokens fade with their layer.
 *
 * We render two stacked layers and interpolate their opacity + a small vertical
 * slide. Because there are no DOM measurements and no wall-clock reads, calling
 * this at any `progress` reproduces the same layers — exact seeking for phase 3.
 */
export function morphLayers(
  from: KeyedTokensInfo,
  to: KeyedTokensInfo,
  progress: number,
): {leaving: MorphLayer; entering: MorphLayer} {
  // Morph eases both fade and movement with easeInOutCubic so the cross-dissolve
  // accelerates then settles instead of tracking time linearly.
  const p = easeInOutCubic(progress);
  const toKeys = new Set(to.tokens.map(t => t.key));
  const fromKeys = new Set(from.tokens.map(t => t.key));

  // Leaving layer: matched tokens stay opaque; unmatched fade out.
  const leavingTokens = from.tokens.map(token =>
    toRenderToken(token, toKeys.has(token.key) ? 1 : 1 - p),
  );
  // Entering layer: matched tokens stay opaque; unmatched fade in.
  const enteringTokens = to.tokens.map(token =>
    toRenderToken(token, fromKeys.has(token.key) ? 1 : p),
  );

  return {
    leaving: {
      tokens: leavingTokens,
      opacity: 1 - p,
      translateYLines: -0.15 * p,
    },
    entering: {
      tokens: enteringTokens,
      opacity: p,
      translateYLines: 0.15 * (1 - p),
    },
  };
}

/**
 * Crossfade layout: the whole `from` block fades out while the whole `to` block
 * fades in. No token movement — a plain opacity cross-dissolve. Pure in `progress`
 * so it is fully seekable. Slide 0 (empty `from`) reads as a clean fade-in.
 */
export function fadeLayers(
  from: KeyedTokensInfo,
  to: KeyedTokensInfo,
  progress: number,
): {leaving: MorphLayer; entering: MorphLayer} {
  // Fade eases opacity with easeInOutCubic — a smooth in/out dissolve.
  const p = easeInOutCubic(progress);
  return {
    leaving: {
      tokens: fullTokens(from),
      opacity: 1 - p,
      translateYLines: 0,
    },
    entering: {
      tokens: fullTokens(to),
      opacity: p,
      translateYLines: 0,
    },
  };
}

/** A single rendered line of tokens plus its animation offset/opacity. */
export interface RenderLine {
  readonly key: string;
  readonly tokens: RenderToken[];
  /** Horizontal offset as a fraction of the surface width (-1..1). */
  readonly translateX: number;
  readonly opacity: number;
}

/** A line-based slide layout: leaving lines slide out left, entering slide in right. */
export interface SlideLineLayers {
  readonly leaving: RenderLine[];
  readonly entering: RenderLine[];
}

/**
 * Group a keyed token set into lines (arrays of tokens), splitting on newline
 * tokens. The newline tokens themselves are dropped — line breaks are structural
 * here (each line renders in its own block), not inline `<br>`s.
 */
export function tokensToLines(info: KeyedTokensInfo): RenderToken[][] {
  const lines: RenderToken[][] = [[]];
  for (const token of info.tokens) {
    if (token.content === '\n') {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push(toRenderToken(token, 1));
  }
  return lines;
}

/**
 * Line-level slide transition (snappify's SlideIn). Diffs `from`/`to` by whole
 * lines: unchanged lines hold in place; removed lines slide out to the left and
 * fade; added/changed lines slide in from the right and fade in. Purely a
 * function of `progress`, so seeking reproduces the exact layout — the export
 * invariant. Slide 0 (empty `from`) yields an all-entering slide-in.
 */
export function slideLines(
  from: KeyedTokensInfo,
  to: KeyedTokensInfo,
  progress: number,
): SlideLineLayers {
  // Slide eases X-position with easeOutCubic (lines rush in then settle) and
  // opacity with easeInOutCubic (a softer in/out fade). Two separate curves so
  // the horizontal travel decelerates while the fade stays symmetric.
  const pos = easeOutCubic(progress);
  const op = easeInOutCubic(progress);
  const fromLines = tokensToLines(from);
  const toLines = tokensToLines(to);
  const diff = diffLines(from.code, to.code);

  const leaving: RenderLine[] = [];
  const entering: RenderLine[] = [];

  diff.forEach((entry, i) => {
    if (entry.kind === 'common') {
      // Unchanged line: render once in the entering layer, fully settled.
      const tokens = toLines[entry.nextIndex] ?? [];
      entering.push({
        key: `c-${entry.prevIndex}-${entry.nextIndex}-${i}`,
        tokens,
        translateX: 0,
        opacity: 1,
      });
    } else if (entry.kind === 'removed') {
      const tokens = fromLines[entry.prevIndex] ?? [];
      leaving.push({
        key: `r-${entry.prevIndex}-${i}`,
        tokens,
        translateX: -0.35 * pos,
        opacity: 1 - op,
      });
    } else {
      const tokens = toLines[entry.nextIndex] ?? [];
      entering.push({
        key: `a-${entry.nextIndex}-${i}`,
        tokens,
        translateX: 0.35 * (1 - pos),
        opacity: op,
      });
    }
  });

  return {leaving, entering};
}
