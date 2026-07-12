/**
 * Pure, deterministic math for video export. No DOM, no WebCodecs, no wall clock
 * — everything here is a pure function of its inputs so it is trivially testable
 * and keeps the encoder/capture layers thin.
 */

import type {Timeline} from '../state/playback/timeline';

/** Fixed capture frame rate. Exposed so the UI can display it. */
export const EXPORT_FPS = 30;

/**
 * Round a pixel dimension down to the nearest even number. H.264 requires even
 * width and height; using the same rounded values for the muxer config, the
 * encoder config and every VideoFrame is what keeps the output from corrupting.
 * A minimum of 2 keeps the encoder from choking on a zero dimension.
 */
export function roundToEven(value: number): number {
  const floored = Math.floor(value);
  const even = floored - (floored % 2);
  return Math.max(2, even);
}

/** Capture dimensions after applying pixelRatio and even-rounding. */
export interface CaptureSize {
  readonly width: number;
  readonly height: number;
}

/** A raw (unrounded) width/height pair, e.g. a measured CSS box. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Fold a list of measured slide sizes into the single locked capture size: the
 * per-axis maximum, scaled by pixelRatio and even-rounded (H.264 needs even
 * dims). Independent max per axis means the locked box fits the widest AND the
 * tallest slide even when those are different slides. An empty list yields the
 * 2x2 floor rather than throwing so callers can validate the result.
 */
export function maxCaptureSize(
  sizes: readonly Size[],
  pixelRatio: number,
): CaptureSize {
  let maxWidth = 0;
  let maxHeight = 0;
  for (const {width, height} of sizes) {
    if (width > maxWidth) maxWidth = width;
    if (height > maxHeight) maxHeight = height;
  }
  return captureSizeFor(maxWidth, maxHeight, pixelRatio);
}

/** Top-left offset (device px) that centers `inner` inside `outer`. */
export interface CenterOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * Integer top-left offset that centers a smaller captured canvas inside the
 * fixed backing canvas. Rounded to whole device pixels so drawImage doesn't blur
 * on a half-pixel seam; clamped at 0 so an over-large inner (rounding slop) pins
 * to the corner rather than drawing off-canvas.
 */
export function centerOffset(outer: CaptureSize, inner: Size): CenterOffset {
  return {
    x: Math.max(0, Math.round((outer.width - inner.width) / 2)),
    y: Math.max(0, Math.round((outer.height - inner.height) / 2)),
  };
}

/**
 * Compute the even-rounded capture size from the DOM node's CSS size and the
 * chosen pixelRatio. Both dimensions are rounded down to even independently.
 */
export function captureSizeFor(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): CaptureSize {
  return {
    width: roundToEven(cssWidth * pixelRatio),
    height: roundToEven(cssHeight * pixelRatio),
  };
}

/**
 * Total number of frames for a timeline at a given fps. The end frame is
 * inclusive so the final held frame is present in the output; a zero-duration
 * timeline still yields a single frame.
 */
export function frameCount(totalDurationMs: number, fps: number): number {
  if (totalDurationMs <= 0) return 1;
  return Math.max(1, Math.floor((totalDurationMs / 1000) * fps) + 1);
}

/** Injected time (ms) for a given frame index at a given fps. */
export function frameTimeMs(frameIndex: number, fps: number): number {
  return (frameIndex / fps) * 1000;
}

/**
 * Presentation timestamp (microseconds) for a given frame index at a given fps.
 * WebCodecs and mp4-muxer both work in microseconds.
 */
export function frameTimestampMicros(frameIndex: number, fps: number): number {
  return Math.round((frameIndex * 1_000_000) / fps);
}

/** Per-frame duration in microseconds. */
export function frameDurationMicros(fps: number): number {
  return Math.round(1_000_000 / fps);
}

/**
 * A sane target bitrate scaled by resolution: ~0.1 bits per pixel per frame at
 * 30fps keeps code screencasts crisp without bloating the file.
 */
export function targetBitrate(
  width: number,
  height: number,
  fps: number,
): number {
  const bitsPerPixel = 0.1;
  return Math.round(width * height * fps * bitsPerPixel);
}

/**
 * One probe time (ms) per slide, at the midpoint of that slide's hold segment.
 * The pre-pass seeks to each of these, lets the DOM settle, and measures — the
 * hold phase is the fully-revealed, static layout, so it is the largest a slide
 * ever gets (typing only shrinks content; transitions interpolate between two
 * holds). Midpoint (not edge) avoids landing on a phase boundary. Slides with no
 * hold segment (0ms hold) fall back to the segment start so every slide is probed.
 *
 * Returns times in slide order; index i is slide i's probe time.
 */
export function slideProbeTimesMs(timeline: Timeline): readonly number[] {
  const holdStartBySlide = new Map<number, {start: number; duration: number}>();
  for (const segment of timeline.segments) {
    if (segment.phase !== 'hold') continue;
    if (!holdStartBySlide.has(segment.slideIndex)) {
      holdStartBySlide.set(segment.slideIndex, {
        start: segment.startMs,
        duration: segment.durationMs,
      });
    }
  }

  const slideCount = holdStartBySlide.size;
  const times: number[] = [];
  for (let i = 0; i < slideCount; i++) {
    const hold = holdStartBySlide.get(i);
    // Defensive: a slide with no hold segment probes at 0; still ordered by i.
    times.push(hold ? hold.start + hold.duration / 2 : 0);
  }
  return times;
}

/**
 * Decide which frame indices need a fresh DOM snapshot and which can reuse the
 * snapshot of an earlier frame. During a `hold` phase the rendered content is
 * static, so only the first frame of each contiguous hold run needs capturing;
 * every later frame in that run reuses it. Typing and transition frames always
 * need a fresh capture because their content changes every frame.
 *
 * Returns, for each frame index, the index of the frame whose bitmap it should
 * use. `sourceFrame[i] === i` means "capture fresh"; `sourceFrame[i] < i` means
 * "reuse the bitmap already captured for sourceFrame[i]".
 */
export function holdReuseMap(
  timeline: Timeline,
  fps: number,
  stateAt: (timeline: Timeline, tMs: number) => {phase: string; slideIndex: number},
): readonly number[] {
  const total = frameCount(timeline.totalDurationMs, fps);
  const sourceFrame: number[] = new Array(total);

  let holdRunStart = -1;
  let holdRunSlide = -1;

  for (let i = 0; i < total; i++) {
    const {phase, slideIndex} = stateAt(timeline, frameTimeMs(i, fps));
    const isHold = phase === 'hold';

    // A hold run continues only while the phase stays 'hold' AND the slide is
    // unchanged. Any change (phase or slide) opens a new run that captures fresh.
    const continuesRun =
      isHold && holdRunStart >= 0 && slideIndex === holdRunSlide;

    if (continuesRun) {
      sourceFrame[i] = holdRunStart;
    } else {
      sourceFrame[i] = i;
      holdRunStart = isHold ? i : -1;
      holdRunSlide = isHold ? slideIndex : -1;
    }
  }

  return sourceFrame;
}
