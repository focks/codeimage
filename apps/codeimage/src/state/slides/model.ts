import type {PersistedFrameState} from '@codeimage/store/frame/model';
import type {
  PersistedEditorState,
  PersistedTerminalState,
} from '@codeimage/store/editor/model';

/**
 * How a slide enters (its code-change animation), snappify-style. `inherit` means
 * "use the global default transition mode" (which itself resolves to a concrete
 * mode). The remaining values are the five concrete entry animations. Slide 0's
 * entry types from empty; later slides animate the change from the previous slide.
 */
export type SlideTransitionIn =
  | 'inherit'
  | 'none'
  | 'fade'
  | 'slide'
  | 'morph'
  | 'typewriter';

/**
 * Per-slide playback overrides (v3). Every field is optional; `undefined` means
 * "inherit the global playback setting". Storing these on the slide keeps the
 * timeline a pure function of slide data + global defaults, so preview and video
 * export honour them through the same buildTimelineFromSlides path.
 */
export interface Slide {
  id: string;
  frame: PersistedFrameState;
  terminal: PersistedTerminalState;
  editor: PersistedEditorState;
  /** How this slide enters. `undefined`/`'inherit'` => global default mode. */
  transitionIn?: SlideTransitionIn;
  /**
   * Duration of THIS slide's entry animation, in ms (fade/slide/morph). `undefined`
   * => inherit the global `transitionMs`. Does not apply to a `typewriter` entry,
   * whose duration is charCount-driven (see `typewriterCharMs`). Added in v4.
   */
  transitionMs?: number;
  /** Per-slide hold duration override in ms. `undefined` => global holdMs. */
  holdMs?: number;
  /** Typewriter timing as ms-per-character. `undefined` => derive from global cps. */
  typewriterCharMs?: number;
}

export interface SlidesState {
  slides: Slide[];
  activeSlideIndex: number;
}

export interface PersistedSlidesState {
  $version: string;
  slides: Slide[];
  activeSlideIndex: number;
}

// Keep the IDB key stable so existing decks still load; the frame store coerces
// missing min-width/min-height to 0 (off) when hydrating pre-v2 slide data.
export const SLIDES_IDB_KEY = 'slides$v1';
// v2 adds per-slide frame minWidth/minHeight to PersistedFrameState.
// v3 adds per-slide transitionIn/holdMs/typewriterCharMs overrides. Pre-v3 slides
// simply lack these keys, which reads as "inherit global" — no coercion needed.
// v4 adds per-slide transitionMs (entry duration override). Pre-v4 slides lack the
// key, which reads as "inherit global transitionMs" — again no coercion needed.
// v5 adds explicit frame width/height + autoWidth/autoHeight to PersistedFrameState.
// Pre-v5 slides lack these keys; `coercePersistedFrameSize` (frame/model.ts) fills
// them (auto flags -> true, sizes -> 0) so older decks stay content-driven.
export const SLIDES_VERSION = '5';
