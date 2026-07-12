import type {KeyedToken, KeyedTokensInfo} from 'shiki-magic-move/core';
import {typedCharCount} from '../../state/playback/timeline';

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
  const p = clamp01(progress);
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

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
