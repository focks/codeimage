/**
 * Pure helpers for GIF frame scheduling. No DOM, no encoder — just the math
 * for mapping a holdReuseMap to GIF frame records with accumulated delays.
 *
 * GIF delays are in 1/100-second (centisecond) units. The key insight is that
 * for held frames we don't encode duplicates — we simply accumulate the delay
 * on the single source frame, keeping GIF files small.
 */

/** GIF has a hard fps cap: browser decoders clamp sub-20ms delays to ~100ms. */
export const GIF_MAX_FPS = 15;

/** A single record describing one physical GIF frame. */
export interface GifFrameRecord {
  /** Index into the frame capture array to use as the pixel source. */
  readonly sourceFrameIndex: number;
  /** Duration in milliseconds (1/fps per captured frame plus any held frames). */
  readonly delayMs: number;
}

/**
 * Convert a holdReuseMap (one entry per logical frame) into an array of
 * GifFrameRecord — one entry per PHYSICAL GIF frame. Adjacent logical frames
 * that reuse the same source are collapsed into a single record with their
 * delays summed; this avoids emitting redundant duplicate frames in the stream.
 *
 * @param reuseMap  Output of holdReuseMap(): reuseMap[i] is the source index
 *                  for logical frame i.
 * @param fps       Frames per second used for the capture (≤ GIF_MAX_FPS).
 * @returns         Ordered array of physical GIF frames with accumulated delays.
 */
export function gifFrameRecords(
  reuseMap: readonly number[],
  fps: number,
): GifFrameRecord[] {
  const frameMs = 1000 / fps;
  const records: GifFrameRecord[] = [];

  // Walk through each logical frame and either start a new record or add its
  // time to the last record when the source is the same.
  for (let i = 0; i < reuseMap.length; i++) {
    const src = reuseMap[i];
    const last = records[records.length - 1];

    // Same source as previous record → just accumulate the delay.
    if (last !== undefined && last.sourceFrameIndex === src) {
      records[records.length - 1] = {
        sourceFrameIndex: src,
        delayMs: last.delayMs + frameMs,
      };
    } else {
      records.push({sourceFrameIndex: src, delayMs: frameMs});
    }
  }

  return records;
}

/**
 * Convert a delay in milliseconds to GIF centiseconds (1/100 s), rounded to
 * the nearest integer and clamped to at least 2 (browsers enforce a minimum
 * of ~20ms even for 1cs; 2cs is safe and avoids the invisible-frame bug).
 */
export function msToGifDelay(ms: number): number {
  return Math.max(2, Math.round(ms / 10));
}
