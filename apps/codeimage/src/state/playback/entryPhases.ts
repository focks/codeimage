/**
 * ONE unified, pure sub-phase model for every composite slide entry.
 *
 * An entry is no longer a single "reveal from 0" ramp: it is a short sequence of
 * timed beats so a slide begins from a clean, EMPTY editor and only THEN types its
 * code in one character at a time. Two entry families share this one module rather
 * than diverging into parallel systems:
 *
 *   - typewriter: {clearMs?, emptyMs, typeMs}
 *       clear (only when there IS outgoing text) — the previous code fades out.
 *       empty                                    — nothing but the blinking caret.
 *       type                                     — the incoming code types in.
 *
 *   - window (fade / slide): {windowMs, typeMs}
 *       window — outgoing text leaves AND the EMPTY editor enters (a crossfade for
 *                fade, a line-level slide for slide); no code is revealed yet.
 *       type   — the caret appears and the incoming code types in char-by-char.
 *
 * Every family funnels through a shared `type` beat driven by the identical
 * char-reveal math, and every entry has a single "sizing settle" point at the
 * START of that type beat: the window morphs the box up to that point and then
 * holds it FIXED while the text fills a stable window.
 *
 * Everything here is a pure function of a linear entry `progress` (0..1), so the
 * rendered frame at any injected time is reproducible — the seek-exact invariant
 * video export relies on. The renderer, the sizing, and the timeline all consume
 * this so the sub-phase boundaries stay the single source of truth.
 */

/** Quick fade-out of the outgoing slide's code before the empty beat, in ms. */
export const TYPEWRITER_CLEAR_MS = 150;

/** Clean empty-editor beat (caret only) before typing begins, in ms. */
export const TYPEWRITER_EMPTY_MS = 300;

/** The sub-phases any entry can move through, across both families. */
export type EntrySubPhase = 'clear' | 'empty' | 'window' | 'type';

/**
 * A typewriter entry: a quick `clear` of the outgoing code (only when there is
 * outgoing text), a clean `empty` beat, then the `type` beat.
 */
export interface TypewriterEntrySpec {
  readonly kind: 'typewriter';
  /** Fade-out of the outgoing code, in ms. 0 on slide 0 (nothing to clear). */
  readonly clearMs: number;
  /** Clean empty-editor beat before typing, in ms. */
  readonly emptyMs: number;
  /** Char-reveal beat, in ms (charCount × ms-per-char). */
  readonly typeMs: number;
}

/**
 * A fade/slide entry: a single `window` beat that swaps the outgoing text for the
 * EMPTY editor (crossfade for fade, line-slide for slide), then the `type` beat.
 */
export interface WindowEntrySpec {
  readonly kind: 'window';
  /** Out+in window beat (empty editor enters), in ms — the mode's transition duration. */
  readonly windowMs: number;
  /** Char-reveal beat, in ms (charCount × ms-per-char). */
  readonly typeMs: number;
}

/** Discriminated union of every composite entry family. */
export type EntrySpec = TypewriterEntrySpec | WindowEntrySpec;

export interface EntrySubPhaseState {
  readonly phase: EntrySubPhase;
  /**
   * Progress within the active sub-phase, clamped to 0..1. For `type` this is the
   * linear reveal progress fed straight into the char-reveal math.
   */
  readonly localProgress: number;
}

/** Build a typewriter spec (thin helper so callers stay declarative). */
export function typewriterSpec(
  charCount: number,
  charMs: number,
  hasOutgoing: boolean,
): TypewriterEntrySpec {
  return {
    kind: 'typewriter',
    clearMs: hasOutgoing ? TYPEWRITER_CLEAR_MS : 0,
    emptyMs: TYPEWRITER_EMPTY_MS,
    typeMs: typeBeatMs(charCount, charMs),
  };
}

/** Build a fade/slide window spec: the window beat + the shared type beat. */
export function windowSpec(
  windowMs: number,
  charCount: number,
  charMs: number,
): WindowEntrySpec {
  return {
    kind: 'window',
    windowMs: Math.max(0, windowMs),
    typeMs: typeBeatMs(charCount, charMs),
  };
}

/**
 * Duration of the type beat: `charCount × charMs`. Zero-length code or a
 * non-positive rate collapses to 0 (no type beat).
 */
export function typeBeatMs(charCount: number, charMs: number): number {
  if (charCount <= 0 || charMs <= 0) return 0;
  return charCount * charMs;
}

/**
 * Total duration of a composite entry INCLUDING every leading beat.
 *
 * The whole entry exists to lead into typing; a spec with NO code to type has no
 * type beat and so no meaningful empty/window beat either — it collapses to 0
 * (nothing to animate), preserving the "skip a zero-length intro" rule that
 * predates these beats. `none`/`morph` are handled by the timeline directly and
 * never reach this module.
 */
export function entryTotalMs(spec: EntrySpec): number {
  if (spec.typeMs <= 0) return 0;
  return leadMs(spec) + spec.typeMs;
}

/**
 * Resolve the sub-phase and its local progress at a linear entry `progress`
 * (0..1). Pure — a given `(progress, spec)` always maps to the same result, so
 * preview and export agree frame-for-frame.
 *
 * Boundaries belong to the LATER sub-phase (progress landing exactly on a boundary
 * reports `localProgress` 0 of the next beat), mirroring `stateAt`'s segment rule.
 */
export function entrySubPhaseAt(
  progress: number,
  spec: EntrySpec,
): EntrySubPhaseState {
  const total = entryTotalMs(spec);

  // Degenerate entry (no code to type): treat as an already-typed frame so the
  // renderer shows the full code rather than an empty window.
  if (total <= 0) return {phase: 'type', localProgress: 1};

  const localMs = clamp01(progress) * total;

  if (spec.kind === 'typewriter') {
    if (spec.clearMs > 0 && localMs < spec.clearMs) {
      return {phase: 'clear', localProgress: localMs / spec.clearMs};
    }
    const emptyStart = spec.clearMs;
    const emptyEnd = spec.clearMs + spec.emptyMs;
    if (localMs < emptyEnd) {
      return {
        phase: 'empty',
        localProgress:
          spec.emptyMs <= 0 ? 1 : (localMs - emptyStart) / spec.emptyMs,
      };
    }
    return {
      phase: 'type',
      localProgress:
        spec.typeMs <= 0 ? 1 : clamp01((localMs - emptyEnd) / spec.typeMs),
    };
  }

  // window family (fade / slide).
  if (localMs < spec.windowMs) {
    return {
      phase: 'window',
      localProgress: spec.windowMs <= 0 ? 1 : localMs / spec.windowMs,
    };
  }
  return {
    phase: 'type',
    localProgress:
      spec.typeMs <= 0 ? 1 : clamp01((localMs - spec.windowMs) / spec.typeMs),
  };
}

/**
 * The fraction of the entry occupied by the leading beats — the point at which the
 * `type` beat begins. The window sizing morphs across [0, sizingSettleAt] and stays
 * FIXED for the rest of the entry (text fills a stable window). Pure.
 */
export function entrySizingSettleAt(spec: EntrySpec): number {
  const total = entryTotalMs(spec);
  if (total <= 0) return 1;
  return leadMs(spec) / total;
}

/** Total duration of the beats BEFORE the type beat, in ms. */
function leadMs(spec: EntrySpec): number {
  return spec.kind === 'typewriter'
    ? spec.clearMs + spec.emptyMs
    : spec.windowMs;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
