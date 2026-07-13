/**
 * Pure sub-phase model for a typewriter entry segment.
 *
 * A typewriter entry is no longer a single "reveal from 0" ramp: it is split into
 * up to three beats so every slide begins with a clean, empty editor before its
 * code types itself in one character at a time:
 *
 *   - `clear` (150ms, only when there IS outgoing text — i.e. slides i>0):
 *     the previous slide's code fades out quickly (eased).
 *   - `empty` (300ms): the editor shows NOTHING but the blinking caret — a clean
 *     empty-window beat.
 *   - `type` (charCount × charMs): chars reveal strictly one at a time, linearly.
 *
 * Everything here is a pure function of a linear entry `progress` (0..1), so the
 * rendered frame at any injected time is reproducible — the seek-exact invariant
 * that video export relies on. The renderer and the timeline both consume this so
 * the sub-phase boundaries stay the single source of truth.
 */

import {typewriterDurationMs} from './timeline';

/** Quick fade-out of the outgoing slide's code before the empty beat, in ms. */
export const TYPEWRITER_CLEAR_MS = 150;

/** Clean empty-editor beat (caret only) before typing begins, in ms. */
export const TYPEWRITER_EMPTY_MS = 300;

/** The three sub-phases a typewriter entry moves through. */
export type TypewriterSubPhase = 'clear' | 'empty' | 'type';

export interface TypewriterSubPhaseState {
  readonly phase: TypewriterSubPhase;
  /**
   * Progress within the active sub-phase, clamped to 0..1. For `type` this is the
   * linear reveal progress fed straight into the char-reveal math.
   */
  readonly localProgress: number;
}

/**
 * Duration of a typewriter entry INCLUDING the leading beats:
 *   (clear if outgoing) + empty + (charCount × charMs).
 *
 * `typewriterDurationMs` stays the pure type-time; the beats are layered on top so
 * the semantic names stay honest. A slide with NO code to type has no type-time and
 * so no meaningful empty-editor beat either — the whole entry collapses to 0
 * (nothing to animate), preserving the pre-beat "skip a zero-length intro" rule.
 */
export function typewriterEntryTotalMs(
  charCount: number,
  charMs: number,
  hasOutgoing: boolean,
): number {
  const type = typewriterDurationMs(charCount, charMs);
  if (type <= 0) return 0;
  const clear = hasOutgoing ? TYPEWRITER_CLEAR_MS : 0;
  return clear + TYPEWRITER_EMPTY_MS + type;
}

/**
 * Resolve the sub-phase and its local progress at a linear entry `progress`
 * (0..1). Pure — a given `(progress, charCount, charMs, hasOutgoing)` always maps
 * to the same result, so preview and export agree frame-for-frame.
 *
 * Boundaries belong to the LATER sub-phase (progress landing exactly on a boundary
 * reports `localProgress` 0 of the next beat), mirroring `stateAt`'s segment rule.
 */
export function typewriterSubPhaseAt(
  progress: number,
  charCount: number,
  charMs: number,
  hasOutgoing: boolean,
): TypewriterSubPhaseState {
  const type = typewriterDurationMs(charCount, charMs);
  const total = typewriterEntryTotalMs(charCount, charMs, hasOutgoing);
  const clear = hasOutgoing ? TYPEWRITER_CLEAR_MS : 0;

  // Degenerate entry (no code to type): treat as an already-typed frame so the
  // renderer shows the full code rather than an empty window.
  if (total <= 0) return {phase: 'type', localProgress: 1};

  const p = clamp01(progress);
  const localMs = p * total;

  if (clear > 0 && localMs < clear) {
    return {phase: 'clear', localProgress: localMs / clear};
  }

  const emptyStart = clear;
  const emptyEnd = clear + TYPEWRITER_EMPTY_MS;
  if (localMs < emptyEnd) {
    return {
      phase: 'empty',
      localProgress:
        TYPEWRITER_EMPTY_MS <= 0 ? 1 : (localMs - emptyStart) / TYPEWRITER_EMPTY_MS,
    };
  }

  // Type beat: linear reveal over the remaining char-time. A zero-length type
  // portion (empty slide) settles at localProgress 1.
  return {
    phase: 'type',
    localProgress: type <= 0 ? 1 : clamp01((localMs - emptyEnd) / type),
  };
}

/**
 * The fraction of the entry occupied by the clear+empty beats — the point at which
 * the `type` beat begins. The window sizing morphs across [0, sizingSettleAt] and
 * stays fixed for the rest of the entry (text fills a stable window). Pure.
 */
export function typewriterSizingSettleAt(
  charCount: number,
  charMs: number,
  hasOutgoing: boolean,
): number {
  const total = typewriterEntryTotalMs(charCount, charMs, hasOutgoing);
  if (total <= 0) return 1;
  const clear = hasOutgoing ? TYPEWRITER_CLEAR_MS : 0;
  return (clear + TYPEWRITER_EMPTY_MS) / total;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
