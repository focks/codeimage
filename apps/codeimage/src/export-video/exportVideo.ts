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
import {stateAt} from '../state/playback/timeline';
import {getSlidesStore} from '../state/slides';
import type {Slide} from '../state/slides/model';
import {ensureHighlighter, shikiThemeFor} from '../components/AnimationView/shikiHighlighter';
import {getUiStore} from '../state/ui';
import {createFrameCapturer, frameExportOptions} from './captureFrame';
import {createMp4Recorder} from './mp4Encoder';
import {
  EXPORT_FPS,
  captureSizeFor,
  frameCount,
  frameDurationMicros,
  frameTimeMs,
  frameTimestampMicros,
  holdReuseMap,
} from './videoExportMath';

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

/** Compute the even-rounded capture size from the node's CSS box + pixelRatio. */
function measure(node: HTMLElement, pixelRatio: number) {
  const rect = node.getBoundingClientRect();
  return captureSizeFor(rect.width, rect.height, pixelRatio);
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

    // Measure the LIVE frame only after the CanvasEditor -> AnimationView swap has
    // settled: flipping isPlaying detaches the editor for a tick, so an immediate
    // measure catches a collapsed (near-zero) box and yields a 2x2 video. Seek to
    // the final held frame (the tallest layout — last slide, fully revealed) and
    // flush before measuring, so the locked capture size fits every frame without
    // clipping. The size is fixed here and reused for all frames (H.264 needs it).
    playback.setCurrentTimeMs(timeline.totalDurationMs);
    applySlideChromeAtTime(timeline.totalDurationMs, timeline);
    await nextFrame();
    await nextFrame();
    const {width, height} = measure(options.node, options.pixelRatio);
    if (width <= 2 || height <= 2) {
      throw new Error('Could not measure the export frame (empty layout).');
    }
    playback.setCurrentTimeMs(0);

    const total = frameCount(timeline.totalDurationMs, EXPORT_FPS);
    const reuseMap = holdReuseMap(timeline, EXPORT_FPS, stateAt);
    const duration = frameDurationMicros(EXPORT_FPS);

    const capture = await createFrameCapturer();
    const exportOptions = frameExportOptions(width, height, options.pixelRatio);
    const recorder = await createMp4Recorder(width, height, EXPORT_FPS);

    // Cache the most recent freshly-captured canvas so hold frames can reuse it.
    let cachedSourceIndex = -1;
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
        cachedCanvas = await capture(options.node, exportOptions);
        cachedSourceIndex = i;
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
      void cachedSourceIndex; // retained for clarity/debugging
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
