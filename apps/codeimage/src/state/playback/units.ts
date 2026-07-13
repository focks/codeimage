/**
 * Pure unit-conversion helpers between the STORED representation (milliseconds,
 * ms-per-character) and the USER-FACING representation (seconds, chars-per-second).
 *
 * All durations are persisted internally in ms (unchanged); the presentation UI
 * and the transition/duration chips speak seconds — Canva-style plain language.
 * Keeping the conversion in one tested place avoids drift between the controls.
 */

/** Milliseconds -> seconds, rounded to one decimal (e.g. 800 -> 0.8). */
export function msToSeconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

/** Seconds -> milliseconds (e.g. 0.8 -> 800). Rounded to whole ms. */
export function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * Format a millisecond duration as a compact seconds label with a trailing "s"
 * (e.g. 2500 -> "2.5s", 1000 -> "1s"). One decimal, trailing ".0" trimmed.
 */
export function formatSecondsLabel(ms: number): string {
  const s = msToSeconds(ms);
  const text = Number.isInteger(s) ? String(s) : s.toFixed(1);
  return `${text}s`;
}

/**
 * ms-per-character -> characters-per-second (e.g. 40 -> 25). Non-positive input
 * yields 0 so the caller can fall back to a default rate.
 */
export function charMsToCharsPerSec(charMs: number): number {
  if (charMs <= 0) return 0;
  return Math.round(1000 / charMs);
}

/**
 * characters-per-second -> ms-per-character (e.g. 25 -> 40). Non-positive input
 * yields 0. Inverse of {@link charMsToCharsPerSec} at the round-trip level.
 */
export function charsPerSecToCharMs(cps: number): number {
  if (cps <= 0) return 0;
  return Math.round(1000 / cps);
}
