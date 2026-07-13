import type {PersistedFrameState} from '@codeimage/store/frame/model';
import type {PersistedTerminalState} from '@codeimage/store/editor/model';
import type {Slide} from '../slides/model';
import {stateAt, type Timeline} from './timeline';

/**
 * Pure per-frame interpolation of a deck's window chrome (problem P3).
 *
 * In preview, frame/terminal style changes between slides animated via CSS
 * transitions; in export, chrome was hydrated at segment boundaries and therefore
 * SNAPPED. This module resolves the chrome for any injected time `tMs` as a pure
 * function of the timeline, so both preview and export drive the identical,
 * seek-exact result:
 *
 *   - hold / typing segment      -> the active slide's chrome verbatim
 *   - transition segment (i-1→i) -> numeric props (padding/radius/opacity) lerp'd
 *     by the segment progress; background resolved to either a single lerp'd flat
 *     color (both endpoints flat) or a two-layer crossfade (either a gradient/URL)
 *
 * Everything here is deterministic: identical `(timeline, tMs)` always yields the
 * identical `ResolvedChrome`, which is what exact-frame video export requires.
 */

/** A flat CSS color we can interpolate channel-wise. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * The chrome to apply for one frame. `frame`/`terminal` carry the (possibly
 * interpolated) per-slide styles; `backgroundLayers` describes how to paint the
 * frame background so a gradient/image transition can crossfade two stacked
 * layers instead of hard-swapping.
 */
export interface ResolvedChrome {
  readonly frame: PersistedFrameState;
  readonly terminal: PersistedTerminalState;
  /**
   * Background paint instructions. `from`/`to` are CSS background values; their
   * opacities cross-fade over the transition. When both endpoints are the same
   * flat color the layers collapse to one fully-opaque layer.
   */
  readonly backgroundLayers: {
    readonly from: string | null;
    readonly fromOpacity: number;
    readonly to: string | null;
    readonly toOpacity: number;
  };
}

/** Clamp to the unit interval. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear interpolation between two numbers. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Parse a flat CSS color (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`) into
 * channels. Returns `null` for anything we can't interpolate (gradients, URLs,
 * named colors, `hsl`, etc.) so the caller falls back to a crossfade.
 */
export function parseColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expand = (h: string) =>
      h.length === 3 || h.length === 4
        ? h
            .split('')
            .map(c => c + c)
            .join('')
        : h;
    const full = expand(hex);
    if (full.length !== 6 && full.length !== 8) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return {r, g, b, a};
  }

  const rgbMatch = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] != null) {
      a = rgbMatch[4].endsWith('%')
        ? Number(rgbMatch[4].slice(0, -1)) / 100
        : Number(rgbMatch[4]);
    }
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return {r, g, b, a};
  }

  return null;
}

/** Serialize channels back to a CSS color, preferring `rgb`/`rgba`. */
export function formatColor(c: Rgb): string {
  const r = Math.round(clamp01(c.r / 255) * 255);
  const g = Math.round(clamp01(c.g / 255) * 255);
  const b = Math.round(clamp01(c.b / 255) * 255);
  const a = clamp01(c.a);
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(a)})`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Interpolate two flat CSS colors in RGB. Returns `null` if either side isn't a
 * parseable flat color (the caller then crossfades instead).
 */
export function lerpColor(
  from: string | null | undefined,
  to: string | null | undefined,
  t: number,
): string | null {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return null;
  return formatColor({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  });
}

/** True when a background value is a flat color we can channel-lerp. */
export function isFlatColor(bg: string | null | undefined): boolean {
  return parseColor(bg) != null;
}

/**
 * Resolve the background paint for a transition between two slides at progress
 * `p`. Flat→flat lerps to one opaque layer; anything else (gradient/image on
 * either side) crossfades two stacked layers by opacity.
 */
export function resolveBackgroundLayers(
  fromBg: string | null | undefined,
  toBg: string | null | undefined,
  p: number,
): ResolvedChrome['backgroundLayers'] {
  const t = clamp01(p);
  if (isFlatColor(fromBg) && isFlatColor(toBg)) {
    const lerped = lerpColor(fromBg, toBg, t);
    return {from: lerped ?? toBg ?? null, fromOpacity: 1, to: null, toOpacity: 0};
  }
  // Gradient/image on either side — can't channel-lerp, so crossfade layers.
  return {
    from: fromBg ?? null,
    fromOpacity: 1 - t,
    to: toBg ?? null,
    toOpacity: t,
  };
}

/** A slide's chrome with no interpolation (holds, typing, single-slide decks). */
function staticChrome(slide: Slide): ResolvedChrome {
  return {
    frame: slide.frame,
    terminal: slide.terminal,
    backgroundLayers: {
      from: slide.frame.background ?? null,
      fromOpacity: 1,
      to: null,
      toOpacity: 0,
    },
  };
}

/**
 * Resolve the chrome to apply at injected time `tMs`. During a transition the
 * numeric frame props are lerp'd and the background crossfades/lerps; terminal
 * window style and boolean frame flags hard-swap at the 50% mark (a discrete
 * header/type change can't be tweened — documented, acceptable).
 */
export function resolveChromeAtTime(
  timeline: Timeline,
  tMs: number,
  slides: readonly Slide[],
): ResolvedChrome | null {
  if (slides.length === 0) return null;
  const {slideIndex, phase, progress} = stateAt(timeline, tMs);

  const leaving = slides[slideIndex];
  if (!leaving) return null;

  // Only `transition` segments interpolate; they carry the LEAVING index and
  // animate into the next slide. Holds/typing render a single slide's chrome.
  if (phase !== 'transition') {
    return staticChrome(leaving);
  }

  const entering = slides[slideIndex + 1];
  if (!entering) return staticChrome(leaving);

  const p = clamp01(progress);
  const half = p < 0.5;

  const frame: PersistedFrameState = {
    // Numeric props tween continuously.
    padding: lerp(leaving.frame.padding, entering.frame.padding, p),
    radius: lerp(leaving.frame.radius, entering.frame.radius, p),
    opacity: lerp(leaving.frame.opacity, entering.frame.opacity, p),
    // Canvas-sizing + boolean props are discrete; swap at the midpoint so the
    // export canvas never resizes mid-transition (it's locked to the max size).
    minWidth: half ? leaving.frame.minWidth : entering.frame.minWidth,
    minHeight: half ? leaving.frame.minHeight : entering.frame.minHeight,
    visible: half ? leaving.frame.visible : entering.frame.visible,
    // Background handled via layers; keep the resolved endpoint here for stores
    // that read a single value (flat→flat gets the lerp'd color).
    background:
      resolveBackgroundLayers(
        leaving.frame.background,
        entering.frame.background,
        p,
      ).from ?? entering.frame.background,
  };

  // Terminal window style hard-swaps at 50% (header/type can't tween).
  const terminal = half ? leaving.terminal : entering.terminal;

  return {
    frame,
    terminal,
    backgroundLayers: resolveBackgroundLayers(
      leaving.frame.background,
      entering.frame.background,
      p,
    ),
  };
}
