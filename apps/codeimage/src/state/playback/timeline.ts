/**
 * Pure, injected-time timeline model for slide playback.
 *
 * The entire playback system is drivable by injected time: real-time preview is
 * a rAF loop feeding `stateAt(now - startT)`; phase 3 video export calls the same
 * `stateAt` with fixed `1/30s` steps and gets deterministic frames. There are no
 * wall-clock reads in this module — `stateAt` is a pure function of `(timeline, tMs)`.
 */

import {typewriterEntryTotalMs} from './typewriterPhases';

export interface PlaybackSettings {
  /** When true, slide #1's code types itself in before the first hold. */
  readonly typingIntro: boolean;
  /** Characters revealed per second during the typing phase. */
  readonly typingCharsPerSec: number;
  /** How long each slide is held static, in milliseconds. */
  readonly holdMs: number;
  /** Magic-move transition duration between adjacent slides, in milliseconds. */
  readonly transitionMs: number;
  /**
   * Default entry animation used when a slide's `transitionIn` is `inherit`.
   * Concrete mode only — never `inherit`. Optional so pre-existing settings
   * fixtures stay valid; readers fall back to `DEFAULT_TRANSITION` when absent.
   */
  readonly defaultTransition?: EntryMode;
}

/** Fallback default entry mode when `settings.defaultTransition` is unset. */
export const DEFAULT_TRANSITION: EntryMode = 'typewriter';

/** The concrete entry animations a slide can play (no `inherit` here). */
export type EntryMode = 'none' | 'fade' | 'slide' | 'morph' | 'typewriter';

export type PlaybackPhase = 'typing' | 'hold' | 'transition';

export interface PlaybackFrameState {
  /** Index of the slide being shown (during transition: the slide being left). */
  readonly slideIndex: number;
  readonly phase: PlaybackPhase;
  /** Progress within the current phase, clamped to 0..1. */
  readonly progress: number;
  /**
   * The entry animation in effect for the current phase. For `typing`/`transition`
   * this is the resolved mode of the entering slide; for `hold` it is `'none'`.
   */
  readonly mode: EntryMode;
  /** Total timeline duration in milliseconds. */
  readonly totalDurationMs: number;
}

/** A single scheduled segment on the timeline. */
export interface TimelineSegment {
  readonly slideIndex: number;
  readonly phase: PlaybackPhase;
  readonly startMs: number;
  readonly durationMs: number;
  /** Entry mode driving this segment's render (`'none'` for holds). */
  readonly mode: EntryMode;
}

export interface Timeline {
  readonly segments: readonly TimelineSegment[];
  readonly totalDurationMs: number;
}

/**
 * Per-slide inputs for the timeline. `charCount` sizes typewriter entries;
 * `entryMode` is the already-resolved concrete mode (inherit chains collapsed by
 * the caller). `holdMs`/`typewriterCharMs` are per-slide overrides — `undefined`
 * falls back to the matching global setting.
 */
export interface SlideTimelineInput {
  readonly charCount: number;
  readonly entryMode: EntryMode;
  readonly holdMs?: number;
  readonly typewriterCharMs?: number;
  /**
   * Per-slide entry (fade/slide/morph) duration override in ms. `undefined` falls
   * back to the global `transitionMs`. Ignored for `typewriter`/`none` entries.
   */
  readonly transitionMs?: number;
}

/** Length of the code string for a slide's active editor tab. */
export function slideCodeLength(code: string): number {
  return code.length;
}

/**
 * Duration of a typewriter entry for a given code length. Times as ms-per-char
 * (snappify's model): `charMs` per character. Zero-length code or a non-positive
 * rate collapses to a 0ms segment so the timeline stays valid.
 */
export function typewriterDurationMs(charCount: number, charMs: number): number {
  if (charCount <= 0 || charMs <= 0) return 0;
  return charCount * charMs;
}

/**
 * Convert a global chars-per-second rate into ms-per-character. Non-positive
 * rates yield 0 (a collapsed typewriter entry). Kept so a slide with no explicit
 * `typewriterCharMs` derives its timing from the global typing speed.
 */
export function charMsFromCharsPerSec(charsPerSec: number): number {
  if (charsPerSec <= 0) return 0;
  return 1000 / charsPerSec;
}

/**
 * Duration of the typing intro for a given code length. Retained for the legacy
 * global model + existing tests: `charCount / charsPerSec * 1000`.
 */
export function typingDurationMs(
  charCount: number,
  charsPerSec: number,
): number {
  if (charCount <= 0 || charsPerSec <= 0) return 0;
  return (charCount / charsPerSec) * 1000;
}

/**
 * Resolve a slide's ms-per-char: prefer the per-slide override, else derive it from
 * the global chars-per-second setting. Kept separate so the entry-duration and the
 * renderer both size the type beat from the identical value.
 */
export function resolveTypewriterCharMs(
  slide: Pick<SlideTimelineInput, 'typewriterCharMs'>,
  settings: PlaybackSettings,
): number {
  return slide.typewriterCharMs != null && slide.typewriterCharMs > 0
    ? slide.typewriterCharMs
    : charMsFromCharsPerSec(settings.typingCharsPerSec);
}

/**
 * Resolve a slide's typewriter entry duration INCLUDING the leading beats: the
 * empty-editor beat always, plus a quick clear beat when there is outgoing text
 * (`hasOutgoing` — true for slides i>0, false for slide 0's intro from empty).
 * `typewriterDurationMs` stays the pure type-time; the beats are added around it.
 */
function typewriterEntryDurationMs(
  slide: SlideTimelineInput,
  settings: PlaybackSettings,
  hasOutgoing: boolean,
): number {
  const charMs = resolveTypewriterCharMs(slide, settings);
  return typewriterEntryTotalMs(slide.charCount, charMs, hasOutgoing);
}

/** Resolved hold duration for a slide: per-slide override, else global. */
function holdDurationMs(
  slide: SlideTimelineInput,
  settings: PlaybackSettings,
): number {
  const value = slide.holdMs != null ? slide.holdMs : settings.holdMs;
  return Math.max(0, value);
}

/**
 * Duration of a slide's entry segment given its resolved mode:
 *   - `typewriter` => clear? + empty + charCount × per-char timing (the beats)
 *   - `none`       => 0 (hard cut, no segment)
 *   - fade/slide/morph => global transition duration
 *
 * `hasOutgoing` gates the typewriter `clear` beat (slide 0's intro has no outgoing
 * text so it skips the clear); it is ignored by the other modes.
 */
function entryDurationMs(
  slide: SlideTimelineInput,
  settings: PlaybackSettings,
  hasOutgoing: boolean,
): number {
  switch (slide.entryMode) {
    case 'none':
      return 0;
    case 'typewriter':
      return typewriterEntryDurationMs(slide, settings, hasOutgoing);
    default: {
      // Prefer the per-slide entry-duration override; else the global default.
      const value =
        slide.transitionMs != null && slide.transitionMs > 0
          ? slide.transitionMs
          : settings.transitionMs;
      return Math.max(0, value);
    }
  }
}

/**
 * Build a timeline from per-slide inputs and global settings.
 *
 * Segment layout, per slide i (0-based):
 *   slide 0: [entry(mode0)? as `typing`] -> hold
 *   slide i>0: [entry(mode_i)? as `transition`, slideIndex i-1] -> hold(i)
 *
 * Each slide's ENTRY animation plays first, then the slide holds. Slide 0's entry
 * types/fades/etc. in from empty and is tagged `typing` (so seek/reveal logic and
 * the caret keep working); later slides' entries animate the change from the
 * previous slide and are tagged `transition`, carrying the LEAVING slide index
 * (i-1) — the invariant the existing morph renderer + export math rely on. A
 * `none` entry contributes no segment (hard cut). Zero-length entries collapse.
 *
 * Overload note: `buildTimeline(number[], settings)` (legacy, global typing intro)
 * is preserved for existing callers/tests by deriving per-slide inputs internally.
 */
export function buildTimeline(
  slides: readonly SlideTimelineInput[],
  settings: PlaybackSettings,
): Timeline;
export function buildTimeline(
  codeLengths: readonly number[],
  settings: PlaybackSettings,
): Timeline;
export function buildTimeline(
  input: readonly SlideTimelineInput[] | readonly number[],
  settings: PlaybackSettings,
): Timeline {
  const slides = normalizeSlideInputs(input, settings);

  const segments: TimelineSegment[] = [];
  let cursor = 0;

  const pushSegment = (
    slideIndex: number,
    phase: PlaybackPhase,
    durationMs: number,
    mode: EntryMode,
  ): void => {
    // Skip zero-length segments so phase boundaries stay unambiguous.
    if (durationMs <= 0) return;
    segments.push({slideIndex, phase, startMs: cursor, durationMs, mode});
    cursor += durationMs;
  };

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    // Slide 0 enters from empty (no outgoing text -> no typewriter clear beat);
    // later slides clear the previous slide first.
    const duration = entryDurationMs(slide, settings, i > 0);
    // Slide 0 enters from empty (`typing` phase); later slides animate the change
    // from the previous slide (`transition` phase, carrying the leaving index).
    if (i === 0) {
      pushSegment(0, 'typing', duration, slide.entryMode);
    } else {
      pushSegment(i - 1, 'transition', duration, slide.entryMode);
    }
    pushSegment(i, 'hold', holdDurationMs(slide, settings), 'none');
  }

  return {segments, totalDurationMs: cursor};
}

/**
 * Coerce the two accepted input shapes into resolved `SlideTimelineInput`s.
 * A `number[]` is the legacy code-length form: slide 0's entry is a typewriter
 * iff `settings.typingIntro`, every other slide morphs (the pre-v3 behaviour).
 */
function normalizeSlideInputs(
  input: readonly SlideTimelineInput[] | readonly number[],
  settings: PlaybackSettings,
): readonly SlideTimelineInput[] {
  if (input.length === 0) return [];
  if (typeof input[0] === 'number') {
    const lengths = input as readonly number[];
    return lengths.map((charCount, i) => ({
      charCount,
      entryMode: i === 0 ? (settings.typingIntro ? 'typewriter' : 'none') : 'morph',
    }));
  }
  return input as readonly SlideTimelineInput[];
}

/**
 * Resolve the frame state at an injected time `tMs`. Pure and deterministic:
 * identical `(timeline, tMs)` always yields an identical result — the property
 * phase 3 relies on for exact-frame video export.
 */
export function stateAt(timeline: Timeline, tMs: number): PlaybackFrameState {
  const {segments, totalDurationMs} = timeline;

  // Empty timeline (no slides / all-zero durations): a single static frame.
  if (segments.length === 0) {
    return {
      slideIndex: 0,
      phase: 'hold',
      progress: 0,
      mode: 'none',
      totalDurationMs,
    };
  }

  // Clamp before the start.
  if (tMs <= 0) {
    const first = segments[0];
    return {
      slideIndex: first.slideIndex,
      phase: first.phase,
      progress: 0,
      mode: first.mode,
      totalDurationMs,
    };
  }

  // Clamp at / past the end: settle on the last segment fully complete.
  if (tMs >= totalDurationMs) {
    const last = segments[segments.length - 1];
    return {
      slideIndex: last.slideIndex,
      phase: last.phase,
      progress: 1,
      mode: last.mode,
      totalDurationMs,
    };
  }

  // Find the active segment. Boundaries belong to the later segment: a time that
  // lands exactly on a segment start reports progress 0 of that segment.
  for (const segment of segments) {
    const end = segment.startMs + segment.durationMs;
    if (tMs < end) {
      const progress =
        segment.durationMs <= 0
          ? 1
          : clamp01((tMs - segment.startMs) / segment.durationMs);
      return {
        slideIndex: segment.slideIndex,
        phase: segment.phase,
        progress,
        mode: segment.mode,
        totalDurationMs,
      };
    }
  }

  // Unreachable given the end-clamp above, but keep it total.
  const last = segments[segments.length - 1];
  return {
    slideIndex: last.slideIndex,
    phase: last.phase,
    progress: 1,
    mode: last.mode,
    totalDurationMs,
  };
}

/**
 * Number of characters to reveal during a typing phase at `progress`. Pure
 * function of progress so the typing reveal is fully seekable.
 */
export function typedCharCount(totalChars: number, progress: number): number {
  if (totalChars <= 0) return 0;
  return Math.floor(clamp01(progress) * totalChars);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
