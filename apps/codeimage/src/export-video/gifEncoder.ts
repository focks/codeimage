/**
 * GIF encoder wiring using gifenc. Mirrors the Mp4Recorder interface shape so
 * exportVideo.ts can stay format-agnostic via an encoder factory. Produces a
 * looping GIF at ≤15fps with per-frame palette quantisation (256 colours).
 *
 * Differences from the MP4 path:
 * - GIF frames carry a delayMs (centisecond granularity) instead of a PTS.
 * - Duplicate hold frames are collapsed: the caller passes a
 *   pre-computed GifFrameRecord[] from gifHelpers so this module just encodes
 *   what it receives without needing to know about the reuse map.
 * - finish() returns a Blob synchronously (no async flush needed).
 */

import {GIFEncoder, quantize, applyPalette} from 'gifenc';
import {msToGifDelay} from './gifHelpers';

export interface GifRecorder {
  /**
   * Encode one physical GIF frame. `canvas` is a composited backing canvas at
   * the locked export size; `delayMs` is the total hold time for this frame
   * (may span multiple logical frames that were collapsed).
   */
  encodeFrame(canvas: HTMLCanvasElement, delayMs: number): void;
  /** Finalise the GIF stream and return the Blob. Synchronous. */
  finish(): Blob;
}

/**
 * Create a GIF recorder for a fixed resolution. The encoder writes all frames
 * into an in-memory buffer; call finish() once all frames have been pushed.
 *
 * @param width   Canvas width in pixels (even number, matches capture size).
 * @param height  Canvas height in pixels.
 */
export function createGifRecorder(
  width: number,
  height: number,
): GifRecorder {
  const gif = GIFEncoder({auto: true});
  // Scratch canvas for extracting RGBA pixel data frame-by-frame.
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext('2d', {willReadFrequently: true});
  if (!scratchCtx) {
    throw new Error('Could not acquire scratch 2D context for GIF encoding.');
  }

  let firstFrame = true;

  return {
    encodeFrame(canvas, delayMs) {
      // Draw the composited canvas into the scratch canvas so we can read RGBA.
      scratchCtx.clearRect(0, 0, width, height);
      scratchCtx.drawImage(canvas, 0, 0, width, height);
      const imageData = scratchCtx.getImageData(0, 0, width, height);
      const rgba = imageData.data; // Uint8ClampedArray, 4 bytes per pixel

      // Quantize to at most 256 colours using pnnquant2 (gifenc's built-in).
      const palette = quantize(rgba, 256, {format: 'rgb444', oneBitAlpha: false});
      // Map each pixel to its nearest palette index.
      const index = applyPalette(rgba, palette, 'rgb444');

      const delay = msToGifDelay(delayMs);

      gif.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: 0, // loop forever (Netscape ext emitted on first frame)
        ...(firstFrame ? {} : {}),
      });

      firstFrame = false;
    },

    finish() {
      gif.finish();
      const bytes = gif.bytes();
      // Copy into a fresh Uint8Array backed by a plain ArrayBuffer so Blob
      // constructor accepts it without SharedArrayBuffer ambiguity in strict TS.
      const copy = new Uint8Array(bytes);
      return new Blob([copy], {type: 'image/gif'});
    },
  };
}
