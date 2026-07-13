/**
 * Typewriter-flavoured view over the unified entry-phase model (`entryPhases.ts`).
 *
 * The composition of every entry now lives in ONE module (`entryPhases.ts`); this
 * file is the thin, typewriter-specific adapter: it builds a typewriter `EntrySpec`
 * (clear? + empty + type) from a slide's char count / timing and delegates the beat
 * math. The exported names are kept so callers and the existing tests read straight,
 * but there is no second, divergent phase system underneath — everything routes
 * through `entrySubPhaseAt` / `entryTotalMs` / `entrySizingSettleAt`.
 *
 * The three beats a typewriter entry moves through:
 *   - `clear` (150ms, only when there IS outgoing text — i.e. slides i>0): the
 *     previous slide's code fades out quickly (eased).
 *   - `empty` (300ms): the editor shows NOTHING but the blinking caret.
 *   - `type` (charCount × charMs): chars reveal strictly one at a time, linearly.
 */

import {
  entrySizingSettleAt,
  entrySubPhaseAt,
  entryTotalMs,
  typewriterSpec,
  TYPEWRITER_CLEAR_MS,
  TYPEWRITER_EMPTY_MS,
  type EntrySubPhaseState,
} from './entryPhases';

export {TYPEWRITER_CLEAR_MS, TYPEWRITER_EMPTY_MS};

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
 * A slide with NO code to type has no type-time and so no meaningful empty-editor
 * beat either — the whole entry collapses to 0 (nothing to animate), preserving the
 * pre-beat "skip a zero-length intro" rule.
 */
export function typewriterEntryTotalMs(
  charCount: number,
  charMs: number,
  hasOutgoing: boolean,
): number {
  return entryTotalMs(typewriterSpec(charCount, charMs, hasOutgoing));
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
  const state: EntrySubPhaseState = entrySubPhaseAt(
    progress,
    typewriterSpec(charCount, charMs, hasOutgoing),
  );
  // A typewriter spec only ever yields clear/empty/type — narrow the union.
  return state as TypewriterSubPhaseState;
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
  return entrySizingSettleAt(typewriterSpec(charCount, charMs, hasOutgoing));
}
