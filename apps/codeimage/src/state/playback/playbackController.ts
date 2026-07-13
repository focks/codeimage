import {getFrameState} from '@codeimage/store/editor/frame';
import {getTerminalState} from '@codeimage/store/editor/terminal';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {resolveChromeAtTime} from './chromeInterpolation';
import {getPlaybackStore} from './playbackStore';
import {boundaryPreviewWindow} from './previewMath';
import {resolveSlideInputs} from './slideAnimation';
import {buildTimeline, slideCodeLength, stateAt, type Timeline} from './timeline';

// Re-export the pure preview/present math so callers can import it from the
// controller (its historical home) while the logic lives in `previewMath.ts`.
export {boundaryPreviewWindow, slideEntryStartMs} from './previewMath';

/**
 * Orchestrates play/stop. Time is injected: the rAF loop feeds real time; phase 3
 * feeds fixed 1/30s steps. All slide stepping reads slides[i] directly and never
 * calls setActiveSlide, so no flush is triggered mid-playback (phase-1 gotcha 1).
 *
 * Restore-after-playback is a data-loss path (gotcha 5): we flush the user's live
 * edits into the active slide before starting, snapshot that active index, and on
 * stop rehydrate the exact pre-playback slide so in-progress edits survive.
 */

/**
 * The active editor's code + language for a slide (the tab shown on canvas).
 * PersistedEditorState does not retain which tab was active, so we use the first
 * editor — the canonical "primary" tab and what the export pipeline renders too.
 */
export function activeEditorOf(slide: Slide): {
  code: string;
  languageId: string;
} {
  const active = slide.editor.editors[0];
  return {
    code: active?.code ?? '',
    languageId: active?.languageId ?? 'text',
  };
}

/**
 * Build the timeline for the current slides using the active editor code lengths.
 * Pure w.r.t. its inputs — safe to call from both preview and export.
 */
export function buildTimelineFromSlides(): Timeline {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const slides = slidesStore.state.slides;
  const lengths = slides.map(s => slideCodeLength(activeEditorOf(s).code));
  // Collapse per-slide inherit chains against the global defaults, then build.
  const inputs = resolveSlideInputs(slides, lengths, playback.settings);
  return buildTimeline(inputs, playback.settings);
}

interface StartOptions {
  /** Called on each rAF tick with the injected time; the view reads store state. */
  onFrame?: (currentTimeMs: number) => void;
  /** Called once when playback stops or finishes (after state restore). */
  onStop?: () => void;
  /**
   * Injected start time (ms) for the rAF loop. Defaults to 0 (play the whole
   * deck — the export/"play all" behaviour). The Play button passes the active
   * slide's entry start so it presents from the current slide, Canva-style.
   */
  startAtMs?: number;
}


let rafId: number | null = null;
let restoreSlide: Slide | null = null;
let activeOnStop: (() => void) | undefined;

export function isPlaybackActive(): boolean {
  return rafId !== null;
}

/**
 * Push the interpolated chrome (frame + terminal styling + background paint) for
 * injected time `tMs` into the live stores. Supersedes the old boundary-hydration
 * approach: during a transition segment padding/radius/opacity are lerp'd and the
 * background crossfades/lerps per frame, so preview and export both progress
 * smoothly across a slide boundary instead of snapping (problem P3). Seek-exact —
 * identical `(timeline, tMs)` always applies identical chrome.
 *
 * The editor payload (code/tabs/language) is NOT touched here; it is driven by the
 * AnimationView token pipeline. This only writes the window chrome, which is a
 * playback-scoped write (playbackMode suppresses persist), so saved slides are
 * untouched.
 */
export function applyChromeAtTime(tMs: number, timeline: Timeline): void {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const frameStore = getFrameState();
  const terminalStore = getTerminalState();

  const slides = slidesStore.state.slides;
  const resolved = resolveChromeAtTime(timeline, tMs, slides);
  if (!resolved) return;

  frameStore.setFromPersistedState(resolved.frame);
  terminalStore.setFromPersistedState(resolved.terminal);
  playback.setBackgroundLayers(resolved.backgroundLayers);
}

/**
 * Backwards-compatible boundary hydration (no interpolation). Retained only for
 * callers/tests that expect a hard slide swap; new code should use
 * {@link applyChromeAtTime}, which supersedes this for smooth transitions.
 */
export function applySlideChromeAtTime(tMs: number, timeline: Timeline): void {
  const slidesStore = getSlidesStore();
  const {slideIndex} = stateAt(timeline, tMs);
  const slide = slidesStore.state.slides[slideIndex];
  if (slide) slidesStore.loadSlideIntoStores(slide);
}

/**
 * Begin fullcanvas playback. By default plays the whole deck from t=0 (the export
 * / "play all" behaviour). Pass `startAtMs` to present from a later point — the
 * Play button uses {@link slideEntryStartMs} for the active slide so it presents
 * from the current slide, Canva-style. Idempotent while already playing.
 */
export function startPlayback(options: StartOptions = {}): void {
  if (rafId !== null) return;

  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();

  if (slidesStore.state.slides.length === 0) return;

  // 1) Flush the user's in-progress edits into the active slide (data-loss guard).
  slidesStore.flushCurrentSlideSnapshot();

  // 2) Remember exactly what to restore afterwards.
  restoreSlide = slidesStore.state.slides[slidesStore.state.activeSlideIndex] ?? null;
  activeOnStop = options.onStop;

  const timeline = buildTimelineFromSlides();
  // Clamp the start into the timeline; a start at/after the end has nothing to
  // play, so fall back to 0 (present the whole deck) rather than a no-op.
  const rawStart = options.startAtMs ?? 0;
  const startAtMs =
    rawStart > 0 && rawStart < timeline.totalDurationMs ? rawStart : 0;

  // 3) Enter playback mode — suppresses flush/persist so playback can freely
  //    push chrome styles into the live stores without corrupting saved data.
  slidesStore.setPlaybackMode(true);
  playback.setIsPlaying(true);
  playback.setCurrentTimeMs(startAtMs);

  const startT = performance.now();

  // Apply the interpolated chrome EVERY frame so padding/radius/opacity and the
  // background progress smoothly across slide boundaries (problem P3). This is a
  // playback-scoped write: playbackMode suppresses flush/persist so saved slides
  // are untouched. Preview and export now share `applyChromeAtTime`, so both
  // paths render the identical, seek-exact chrome for a given time.
  applyChromeAtTime(startAtMs, timeline);

  const tick = (now: number): void => {
    const t = startAtMs + (now - startT);
    playback.setCurrentTimeMs(t);

    applyChromeAtTime(t, timeline);

    options.onFrame?.(t);

    if (t >= timeline.totalDurationMs) {
      stopPlayback();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

/**
 * Play a one-shot REAL preview of a single boundary on the canvas: runs the rAF
 * loop over just that boundary's transition window (see {@link boundaryPreviewWindow})
 * using the same playback machinery (playbackMode suppression + full restore).
 * Idempotent while already playing/previewing. Escape or a click cancels via the
 * usual {@link stopPlayback}. Falls back to a no-op when the boundary has no
 * animated entry (e.g. a `none` cut).
 */
export function previewTransition(
  boundaryIndex: number,
  options: StartOptions = {},
): void {
  if (rafId !== null) return;

  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  if (slidesStore.state.slides.length === 0) return;

  const timeline = buildTimelineFromSlides();
  const window = boundaryPreviewWindow(timeline, boundaryIndex);
  if (!window) return;

  // Mirror startPlayback's data-loss guard + restore setup.
  slidesStore.flushCurrentSlideSnapshot();
  restoreSlide =
    slidesStore.state.slides[slidesStore.state.activeSlideIndex] ?? null;
  activeOnStop = options.onStop;

  slidesStore.setPlaybackMode(true);
  playback.setIsPlaying(true);
  playback.setCurrentTimeMs(window.startMs);
  applyChromeAtTime(window.startMs, timeline);

  const startT = performance.now();
  const tick = (now: number): void => {
    const t = window.startMs + (now - startT);
    playback.setCurrentTimeMs(t);
    applyChromeAtTime(t, timeline);
    options.onFrame?.(t);

    if (t >= window.endMs) {
      stopPlayback();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/** Stop playback and restore the exact pre-playback slide + live-store state. */
export function stopPlayback(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();

  playback.setIsPlaying(false);
  // Clear the crossfade layers so the Frame reverts to its single-background
  // rendering once playback ends.
  playback.setBackgroundLayers(null);

  // Rehydrate the user's pre-playback slide into the live stores, then leave
  // playback mode so normal flush/persist resumes with the restored state.
  if (restoreSlide) {
    slidesStore.loadSlideIntoStores(restoreSlide);
  }
  slidesStore.setPlaybackMode(false);
  playback.setCurrentTimeMs(0);

  const cb = activeOnStop;
  restoreSlide = null;
  activeOnStop = undefined;
  cb?.();
}
