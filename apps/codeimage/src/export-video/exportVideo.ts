/**
 * Orchestrates deterministic MP4 export from slides. Drives the same injected-time
 * playback system phase 2 built: it never starts the rAF loop, instead seeking to
 * fixed 1/30s frames, snapshotting the AnimationView surface at each, and feeding
 * the frames to a WebCodecs encoder + mp4-muxer.
 *
 * The whole run is wrapped in playbackMode with a `finally` restore (gotcha 5) so a
 * cancel or encoder error never corrupts the user's saved slides.
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
import {
  EXPORT_FPS,
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
  /** 1 or 2 — maps directly to dom-export pixelRatio. */
  readonly pixelRatio: number;
  /** Called after each frame with (framesDone, totalFrames). */
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
 * size big enough for the widest and tallest slide. O(number of slides) seeks —
 * independent of frame count — so it does not scale the export time per frame.
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

/**
 * Run the export. Resolves with the produced Blob (already downloaded) or a
 * `cancelled` result. Always restores pre-export editor state before resolving.
 */
export async function exportVideo(
  options: ExportVideoOptions,
): Promise<ExportVideoResult> {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();

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
    const frameStore = getFrameState();

    // Pre-pass: probe EVERY slide's rendered size and lock a single capture size
    // big enough for the widest and tallest slide. Earlier code measured only the
    // LAST slide, so slides with more/longer code (or bigger padding) rendered
    // larger than the locked size and got cropped/stretched. Probing each slide's
    // fully-revealed hold layout fixes that; it is O(slides), not O(frames).
    //
    // The two-rAF settle also covers the CanvasEditor -> AnimationView swap: after
    // flipping isPlaying the editor detaches for a tick, so the first measured box
    // can be collapsed — the per-slide seek + settle re-measures cleanly.
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

    const total = frameCount(timeline.totalDurationMs, EXPORT_FPS);
    const reuseMap = holdReuseMap(timeline, EXPORT_FPS, stateAt);
    const duration = frameDurationMicros(EXPORT_FPS);

    const capture = await createFrameCapturer();
    // Capture each frame at its own NATURAL size (no forced canvas dims, which
    // dom-export would stretch — see captureFrame.ts), then composite it centered
    // onto this fixed-size backing canvas so every encoded frame is `size`.
    const exportOptions = frameExportOptions(options.pixelRatio);
    const recorder = await createMp4Recorder(size.width, size.height, EXPORT_FPS);

    const backing = document.createElement('canvas');
    backing.width = size.width;
    backing.height = size.height;
    const backingCtx = backing.getContext('2d');
    if (!backingCtx) {
      throw new Error('Could not acquire a 2D context for the export canvas.');
    }

    // Cache the most recent composited backing canvas so hold frames reuse it.
    let cachedCanvas: HTMLCanvasElement | null = null;

    for (let i = 0; i < total; i++) {
      if (options.isCancelled?.()) {
        return {cancelled: true};
      }

      const tMs = frameTimeMs(i, EXPORT_FPS);
      const needsFreshCapture = reuseMap[i] === i;

      if (needsFreshCapture) {
        // Seek the deterministic playback state, then let Solid flush the DOM.
        playback.setCurrentTimeMs(tMs);
        applySlideChromeAtTime(tMs, timeline);
        await nextFrame();
        const source = await capture(options.node, exportOptions);
        // Fill the margin with the active slide's own frame background so a
        // smaller centered slide reads as extra padding, not a hard letterbox.
        const backfill = resolveBackfillColor(frameStore.store.background);
        cachedCanvas = compositeCentered(
          backing,
          backingCtx,
          size,
          source,
          backfill,
        );
      }

      if (!cachedCanvas) {
        throw new Error('Frame capture produced no canvas.');
      }

      // ponytail: we re-wrap the cached canvas in a fresh VideoFrame every frame
      // rather than caching an encoded chunk — simple and fast enough here.
      const frame = new VideoFrame(cachedCanvas, {
        timestamp: frameTimestampMicros(i, EXPORT_FPS),
        duration,
      });
      openFrames.add(frame);
      try {
        // Keyframe on each fresh source keeps the stream seekable and cheap.
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
  } finally {
    // Close any VideoFrame still open (defensive — the loop closes eagerly).
    for (const frame of openFrames) frame.close();
    openFrames.clear();

    // Restore the exact pre-export slide + leave playback mode (gotcha 1/5).
    if (restoreSlide) slidesStore.loadSlideIntoStores(restoreSlide);
    playback.setIsPlaying(false);
    slidesStore.setPlaybackMode(false);
    playback.setCurrentTimeMs(0);
  }
}
