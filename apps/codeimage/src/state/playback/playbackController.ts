import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {getPlaybackStore} from './playbackStore';
import {buildTimeline, slideCodeLength, stateAt, type Timeline} from './timeline';

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
  const lengths = slidesStore.state.slides.map(s =>
    slideCodeLength(activeEditorOf(s).code),
  );
  return buildTimeline(lengths, playback.settings);
}

interface StartOptions {
  /** Called on each rAF tick with the injected time; the view reads store state. */
  onFrame?: (currentTimeMs: number) => void;
  /** Called once when playback stops or finishes (after state restore). */
  onStop?: () => void;
}

let rafId: number | null = null;
let restoreSlide: Slide | null = null;
let activeOnStop: (() => void) | undefined;

export function isPlaybackActive(): boolean {
  return rafId !== null;
}

/**
 * Push the chrome (frame + terminal window styling) of the slide active at `tMs`
 * into the live stores. Exported so phase 3 can call it before each snapshot to
 * put the chrome in the correct state for the frame it is about to capture.
 */
export function applySlideChromeAtTime(tMs: number, timeline: Timeline): void {
  const slidesStore = getSlidesStore();
  const {slideIndex} = stateAt(timeline, tMs);
  const slide = slidesStore.state.slides[slideIndex];
  if (slide) slidesStore.loadSlideIntoStores(slide);
}

/** Begin fullcanvas playback from slide 1. Idempotent while already playing. */
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

  // 3) Enter playback mode — suppresses flush/persist so playback can freely
  //    push chrome styles into the live stores without corrupting saved data.
  slidesStore.setPlaybackMode(true);
  playback.setIsPlaying(true);
  playback.setCurrentTimeMs(0);

  const timeline = buildTimelineFromSlides();
  const startT = performance.now();
  let appliedChromeIndex = -1;

  // Apply the current slide's chrome (frame + terminal styling) to the live
  // stores so the window chrome animates via its existing CSS transitions. This
  // is a playback-scoped write: playbackMode suppresses flush/persist so saved
  // slides are untouched. Chrome snaps at slide boundaries (acceptable for v1;
  // only the code morph + typing are guaranteed seek-exact per the design).
  applySlideChromeAtTime(0, timeline);
  appliedChromeIndex = stateAt(timeline, 0).slideIndex;

  const tick = (now: number): void => {
    const t = now - startT;
    playback.setCurrentTimeMs(t);

    const idx = stateAt(timeline, t).slideIndex;
    if (idx !== appliedChromeIndex) {
      applySlideChromeAtTime(t, timeline);
      appliedChromeIndex = idx;
    }

    options.onFrame?.(t);

    if (t >= timeline.totalDurationMs) {
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
