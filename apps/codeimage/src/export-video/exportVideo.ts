/**
 * Orchestrates deterministic video/GIF export from slides. Drives the same
 * injected-time playback system phase 2 built: it never starts the rAF loop,
 * instead seeking to fixed-interval frames, snapshotting the AnimationView
 * surface at each, and feeding the composited canvas to a format-specific
 * encoder.
 *
 * The whole run is wrapped in playbackMode with a `finally` restore (gotcha 5)
 * so a cancel or encoder error never corrupts the user's saved slides.
 *
 * Format-agnostic design: the caller selects 'mp4' or 'gif' via `format`. The
 * GIF path drives gifHelpers.gifFrameRecords() to collapse held frames into
 * single records with accumulated delays, keeping file sizes small. The MP4
 * path retains the original VideoFrame-per-logical-frame approach so WebCodecs
 * gets a temporally-dense bitstream.
 */

import download from 'downloadjs';
import {
  applySlideChromeAtTime,
  buildTimelineFromSlides,
  activeEditorOf,
} from '../state/playback/playbackController';
import {getPlaybackStore} from '../state/playback/playbackStore';
import {stateAt, type Timeline} from '../state/playback/timeline';
import {getSlidesStore} from '../state/slides';
import type {Slide} from '../state/slides/model';
import {ensureHighlighter, shikiThemeFor} from '../components/AnimationView/shikiHighlighter';
import {getFrameState} from '../state/editor/frame';
import {getUiStore} from '../state/ui';
import {
  compositeCentered,
  createFrameCapturer,
  frameExportOptions,
} from './captureFrame';
import {createMp4Recorder} from './mp4Encoder';
import {createGifRecorder} from './gifEncoder';
import {GIF_MAX_FPS, gifFrameRecords} from './gifHelpers';
import {
  frameCount,
  frameDurationMicros,
  frameTimeMs,
  frameTimestampMicros,
  holdReuseMap,
  maxCaptureSize,
  slideProbeTimesMs,
  type CaptureSize,
  type Size,
} from './videoExportMath';

/** Neutral dark used to backfill margins when a slide has no solid color set. */
const DEFAULT_BACKFILL = '#0d0d0d';

/** Supported output formats. */
export type ExportFormat = 'mp4' | 'gif';

/**
 * Resolve a solid backfill color for the margin around a centered slide. Only
 * plain CSS color strings (hex / rgb / hsl / named) are used verbatim; asset
 * URLs, gradients or an unset background fall back to a neutral dark so the
 * margin never renders as a broken image reference.
 */
function resolveBackfillColor(background: string | null | undefined): string {
  if (!background) return DEFAULT_BACKFILL;
  const value = background.trim();
  if (value.startsWith('url(') || value.includes('gradient')) {
    return DEFAULT_BACKFILL;
  }
  return value;
}

export interface ExportVideoOptions {
  /** The DOM node exported per frame (same node the image exporter snapshots). */
  readonly node: HTMLElement;
  /** 1, 2 or 4 — maps directly to dom-export pixelRatio (clamped by caller). */
  readonly pixelRatio: number;
  /** Frames per second. GIF path caps at GIF_MAX_FPS. */
  readonly fps: number;
  /** Output format: 'mp4' (default) or 'gif'. */
  readonly format?: ExportFormat;
  /** Called after each captured frame with (framesDone, totalFrames). */
  readonly onProgress?: (done: number, total: number) => void;
  /** Polled between frames; return true to abort cleanly. */
  readonly isCancelled?: () => boolean;
  /** Download filename stem (without extension). */
  readonly fileName?: string;
}

export interface ExportVideoResult {
  readonly cancelled: boolean;
  readonly codec?: string;
  readonly frames?: number;
  readonly blob?: Blob;
}

/** Wait one animation frame so Solid commits the reactive DOM before snapshot. */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/** Pre-warm shiki for every slide's language + the active theme (gotcha 3). */
async function prewarmHighlighter(slides: readonly Slide[]): Promise<void> {
  const ui = getUiStore();
  const theme = shikiThemeFor(ui.currentTheme() === 'dark');
  const langs = slides.map(s => activeEditorOf(s).languageId);
  await ensureHighlighter(langs, [theme]);
}

/** Measure the node's current rendered CSS box (unrounded, pre-pixelRatio). */
function measure(node: HTMLElement): Size {
  const rect = node.getBoundingClientRect();
  return {width: rect.width, height: rect.height};
}

/**
 * Pre-pass: probe every slide's rendered size at the midpoint of its hold phase
 * (the fully-revealed, largest layout) and fold them into one locked capture
 * size big enough for the widest and tallest slide.
 */
async function probeCaptureSize(
  node: HTMLElement,
  pixelRatio: number,
  timeline: Timeline,
  playback: ReturnType<typeof getPlaybackStore>,
  applyChrome: (tMs: number) => void,
  settle: () => Promise<void>,
): Promise<CaptureSize> {
  const probeTimes = slideProbeTimesMs(timeline);
  const sizes: Size[] = [];
  for (const tMs of probeTimes) {
    playback.setCurrentTimeMs(tMs);
    applyChrome(tMs);
    // Two rAFs: one for Solid to commit the reactive DOM, one for layout to
    // settle (chrome padding/background transitions apply on the next frame).
    await settle();
    await settle();
    sizes.push(measure(node));
  }
  return maxCaptureSize(sizes, pixelRatio);
}

// ---------------------------------------------------------------------------
// MP4 export path
// ---------------------------------------------------------------------------

async function exportMp4(
  options: ExportVideoOptions,
  size: CaptureSize,
  timeline: Timeline,
  playback: ReturnType<typeof getPlaybackStore>,
  openFrames: Set<VideoFrame>,
): Promise<ExportVideoResult> {
  const fps = options.fps;
  const total = frameCount(timeline.totalDurationMs, fps);
  const reuseMap = holdReuseMap(timeline, fps, stateAt);
  const duration = frameDurationMicros(fps);
  const frameStore = getFrameState();

  const capture = await createFrameCapturer();
  const exportOptions = frameExportOptions(options.pixelRatio);
  const recorder = await createMp4Recorder(size.width, size.height, fps);

  const backing = document.createElement('canvas');
  backing.width = size.width;
  backing.height = size.height;
  const backingCtx = backing.getContext('2d');
  if (!backingCtx) {
    throw new Error('Could not acquire a 2D context for the export canvas.');
  }

  let cachedCanvas: HTMLCanvasElement | null = null;

  for (let i = 0; i < total; i++) {
    if (options.isCancelled?.()) {
      return {cancelled: true};
    }

    const tMs = frameTimeMs(i, fps);
    const needsFreshCapture = reuseMap[i] === i;

    if (needsFreshCapture) {
      playback.setCurrentTimeMs(tMs);
      applySlideChromeAtTime(tMs, timeline);
      await nextFrame();
      const source = await capture(options.node, exportOptions);
      const backfill = resolveBackfillColor(frameStore.store.background);
      cachedCanvas = compositeCentered(backing, backingCtx, size, source, backfill);
    }

    if (!cachedCanvas) {
      throw new Error('Frame capture produced no canvas.');
    }

    // ponytail: re-wrap the cached canvas in a fresh VideoFrame each iteration.
    const frame = new VideoFrame(cachedCanvas, {
      timestamp: frameTimestampMicros(i, fps),
      duration,
    });
    openFrames.add(frame);
    try {
      recorder.encode(frame, needsFreshCapture || i === 0);
    } finally {
      frame.close();
      openFrames.delete(frame);
    }

    options.onProgress?.(i + 1, total);
  }

  if (options.isCancelled?.()) {
    return {cancelled: true};
  }

  const blob = await recorder.finish();
  download(blob, `${options.fileName ?? 'codeimage'}.mp4`);

  return {
    cancelled: false,
    codec: recorder.muxerCodec,
    frames: total,
    blob,
  };
}

// ---------------------------------------------------------------------------
// GIF export path
// ---------------------------------------------------------------------------

async function exportGif(
  options: ExportVideoOptions,
  size: CaptureSize,
  timeline: Timeline,
  playback: ReturnType<typeof getPlaybackStore>,
): Promise<ExportVideoResult> {
  // GIF has a hard fps cap enforced by browser decoders.
  const fps = Math.min(options.fps, GIF_MAX_FPS);
  const reuseMap = holdReuseMap(timeline, fps, stateAt);
  const frameRecords = gifFrameRecords(reuseMap, fps);
  const frameStore = getFrameState();

  const capture = await createFrameCapturer();
  const exportOptions = frameExportOptions(options.pixelRatio);
  const gif = createGifRecorder(size.width, size.height);

  const backing = document.createElement('canvas');
  backing.width = size.width;
  backing.height = size.height;
  const backingCtx = backing.getContext('2d');
  if (!backingCtx) {
    throw new Error('Could not acquire a 2D context for the GIF export canvas.');
  }

  // Cache map from source-frame-index to composited canvas.
  const canvasCache = new Map<number, HTMLCanvasElement>();

  const total = frameRecords.length;

  for (let ri = 0; ri < total; ri++) {
    if (options.isCancelled?.()) {
      return {cancelled: true};
    }

    const {sourceFrameIndex, delayMs} = frameRecords[ri];

    let composited = canvasCache.get(sourceFrameIndex);
    if (!composited) {
      const tMs = frameTimeMs(sourceFrameIndex, fps);
      playback.setCurrentTimeMs(tMs);
      applySlideChromeAtTime(tMs, timeline);
      await nextFrame();
      const source = await capture(options.node, exportOptions);
      const backfill = resolveBackfillColor(frameStore.store.background);

      // Create a per-frame backing canvas (not shared) so the gif encoder can
      // read it without race conditions while we composite the next frame.
      const frameBacking = document.createElement('canvas');
      frameBacking.width = size.width;
      frameBacking.height = size.height;
      const frameCtx = frameBacking.getContext('2d');
      if (!frameCtx) {
        throw new Error('Could not acquire frame 2D context for GIF encoding.');
      }
      compositeCentered(frameBacking, frameCtx, size, source, backfill);
      canvasCache.set(sourceFrameIndex, frameBacking);
      composited = frameBacking;
    }

    gif.encodeFrame(composited, delayMs);
    options.onProgress?.(ri + 1, total);
  }

  if (options.isCancelled?.()) {
    return {cancelled: true};
  }

  const blob = gif.finish();
  download(blob, `${options.fileName ?? 'codeimage'}.gif`);

  return {
    cancelled: false,
    codec: 'gif',
    frames: total,
    blob,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the export. Resolves with the produced Blob (already downloaded) or a
 * `cancelled` result. Always restores pre-export editor state before resolving.
 */
export async function exportVideo(
  options: ExportVideoOptions,
): Promise<ExportVideoResult> {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const format: ExportFormat = options.format ?? 'mp4';

  if (slidesStore.state.slides.length === 0) {
    throw new Error('Add at least one slide before exporting a video.');
  }

  // 1) Flush in-progress edits + remember the pre-export slide (data-loss guard).
  slidesStore.flushCurrentSlideSnapshot();
  const restoreSlide: Slide | null =
    slidesStore.state.slides[slidesStore.state.activeSlideIndex] ?? null;

  // Track live VideoFrames so a mid-run throw never leaks them (leaks crash tabs).
  const openFrames = new Set<VideoFrame>();

  // 2) Enter playback mode (suppresses persist) + flip isPlaying so ManagedFrame
  //    swaps CanvasEditor -> AnimationView (gotcha 8).
  slidesStore.setPlaybackMode(true);
  playback.setIsPlaying(true);
  playback.setCurrentTimeMs(0);

  try {
    await prewarmHighlighter(slidesStore.state.slides);

    const timeline = buildTimelineFromSlides();

    const size = await probeCaptureSize(
      options.node,
      options.pixelRatio,
      timeline,
      playback,
      tMs => applySlideChromeAtTime(tMs, timeline),
      nextFrame,
    );
    if (size.width <= 2 || size.height <= 2) {
      throw new Error('Could not measure the export frame (empty layout).');
    }
    playback.setCurrentTimeMs(0);

    if (format === 'gif') {
      return await exportGif(options, size, timeline, playback);
    }

    return await exportMp4(options, size, timeline, playback, openFrames);
  } finally {
    // Close any VideoFrame still open (defensive — the MP4 loop closes eagerly).
    for (const frame of openFrames) frame.close();
    openFrames.clear();

    // Restore the exact pre-export slide + leave playback mode (gotcha 1/5).
    if (restoreSlide) slidesStore.loadSlideIntoStores(restoreSlide);
    playback.setIsPlaying(false);
    slidesStore.setPlaybackMode(false);
    playback.setCurrentTimeMs(0);
  }
}
