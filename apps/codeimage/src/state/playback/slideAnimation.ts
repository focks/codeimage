/**
 * Pure resolution of per-slide animation settings into concrete timeline inputs.
 *
 * Slides store their overrides loosely (`transitionIn` may be `'inherit'` or
 * absent; `holdMs`/`typewriterCharMs` may be absent). The timeline needs concrete
 * values, so this module collapses the inherit chains against the global defaults.
 * Kept separate + pure so the resolution is covered by unit tests independent of
 * the store and shared by preview and export.
 */

import type {SlideTransitionIn} from '../slides/model';
import {
  DEFAULT_TRANSITION,
  type EntryMode,
  type PlaybackSettings,
  type SlideTimelineInput,
} from './timeline';

/**
 * Resolve a slide's entry mode. `undefined`/`'inherit'` collapse to the global
 * default transition mode. Slide 0 is special: its legacy behaviour is governed
 * by the `typingIntro` toggle, so an inheriting slide 0 becomes `typewriter` when
 * the toggle is on and `none` when off. A per-slide value always overrides.
 */
export function resolveEntryMode(
  transitionIn: SlideTransitionIn | undefined,
  isFirst: boolean,
  settings: PlaybackSettings,
): EntryMode {
  if (transitionIn && transitionIn !== 'inherit') {
    return transitionIn;
  }
  if (isFirst) {
    return settings.typingIntro ? 'typewriter' : 'none';
  }
  return settings.defaultTransition ?? DEFAULT_TRANSITION;
}

/** Per-slide fields the resolver reads (a subset of `Slide`). */
export interface ResolvableSlide {
  readonly transitionIn?: SlideTransitionIn;
  readonly transitionMs?: number;
  readonly holdMs?: number;
  readonly typewriterCharMs?: number;
}

/**
 * Map slides + their code lengths + global settings into resolved timeline
 * inputs. `codeLengths[i]` is slide i's active-editor char count.
 */
export function resolveSlideInputs(
  slides: readonly ResolvableSlide[],
  codeLengths: readonly number[],
  settings: PlaybackSettings,
): SlideTimelineInput[] {
  return slides.map((slide, i) => ({
    charCount: codeLengths[i] ?? 0,
    entryMode: resolveEntryMode(slide.transitionIn, i === 0, settings),
    holdMs: slide.holdMs,
    typewriterCharMs: slide.typewriterCharMs,
    transitionMs: slide.transitionMs,
  }));
}
