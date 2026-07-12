/**
 * Pure, injected-time timeline model for slide playback.
 *
 * The entire playback system is drivable by injected time: real-time preview is
 * a rAF loop feeding `stateAt(now - startT)`; phase 3 video export calls the same
 * `stateAt` with fixed `1/30s` steps and gets deterministic frames. There are no
 * wall-clock reads in this module — `stateAt` is a pure function of `(timeline, tMs)`.
 */

export interface PlaybackSettings {
  /** When true, slide #1's code types itself in before the first hold. */
  readonly typingIntro: boolean;
  /** Characters revealed per second during the typing phase. */
  readonly typingCharsPerSec: number;
  /** How long each slide is held static, in milliseconds. */
  readonly holdMs: number;
  /** Magic-move transition duration between adjacent slides, in milliseconds. */
  readonly transitionMs: number;
}

export type PlaybackPhase = 'typing' | 'hold' | 'transition';

export interface PlaybackFrameState {
  /** Index of the slide being shown (during transition: the slide being left). */
  readonly slideIndex: number;
  readonly phase: PlaybackPhase;
  /** Progress within the current phase, clamped to 0..1. */
  readonly progress: number;
  /** Total timeline duration in milliseconds. */
  readonly totalDurationMs: number;
}

/** A single scheduled segment on the timeline. */
export interface TimelineSegment {
  readonly slideIndex: number;
  readonly phase: PlaybackPhase;
  readonly startMs: number;
  readonly durationMs: number;
}

export interface Timeline {
  readonly segments: readonly TimelineSegment[];
  readonly totalDurationMs: number;
}

/** Length of the code string for a slide's active editor tab. */
export function slideCodeLength(code: string): number {
  return code.length;
}

/**
 * Duration of the typing intro for a given code length. Zero-length code (or a
 * non-positive typing rate) collapses to a 0ms segment so the timeline stays valid.
 */
export function typingDurationMs(
  charCount: number,
  charsPerSec: number,
): number {
  if (charCount <= 0 || charsPerSec <= 0) return 0;
  return (charCount / charsPerSec) * 1000;
}

/**
 * Build a timeline from the per-slide code lengths and global settings.
 *
 * Structure per slide i (0-based):
 *   [typing? (only i===0 && typingIntro)] -> hold -> [transition (only if i < last)]
 *
 * `codeLengths[i]` is the character count of slide i's active-editor code, used
 * only to size the typing intro of the first slide.
 */
export function buildTimeline(
  codeLengths: readonly number[],
  settings: PlaybackSettings,
): Timeline {
  const segments: TimelineSegment[] = [];
  let cursor = 0;

  const pushSegment = (
    slideIndex: number,
    phase: PlaybackPhase,
    durationMs: number,
  ): void => {
    // Skip zero-length segments so phase boundaries stay unambiguous.
    if (durationMs <= 0) return;
    segments.push({slideIndex, phase, startMs: cursor, durationMs});
    cursor += durationMs;
  };

  const slideCount = codeLengths.length;

  for (let i = 0; i < slideCount; i++) {
    if (i === 0 && settings.typingIntro) {
      pushSegment(
        0,
        'typing',
        typingDurationMs(codeLengths[0] ?? 0, settings.typingCharsPerSec),
      );
    }
    pushSegment(i, 'hold', Math.max(0, settings.holdMs));
    if (i < slideCount - 1) {
      pushSegment(i, 'transition', Math.max(0, settings.transitionMs));
    }
  }

  return {segments, totalDurationMs: cursor};
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
    return {slideIndex: 0, phase: 'hold', progress: 0, totalDurationMs};
  }

  // Clamp before the start.
  if (tMs <= 0) {
    const first = segments[0];
    return {
      slideIndex: first.slideIndex,
      phase: first.phase,
      progress: 0,
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
