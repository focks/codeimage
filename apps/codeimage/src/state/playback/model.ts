import type {PlaybackSettings} from './timeline';

export interface PersistedPlaybackSettings {
  $version: string;
  settings: PlaybackSettings;
}

export const PLAYBACK_IDB_KEY = 'playbackSettings$v1';
export const PLAYBACK_VERSION = '1';

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  typingIntro: true,
  typingCharsPerSec: 30,
  holdMs: 2500,
  transitionMs: 800,
  defaultTransition: 'morph',
};

/** Reasonable UI bounds for the settings controls. */
export const PLAYBACK_SETTINGS_BOUNDS = {
  typingCharsPerSec: {min: 5, max: 120, step: 5},
  holdMs: {min: 500, max: 8000, step: 250},
  transitionMs: {min: 200, max: 3000, step: 100},
  /** Per-slide typewriter timing, ms-per-character. */
  typewriterCharMs: {min: 5, max: 200, step: 5},
} as const;

/**
 * User-facing bounds for the Canva-style transition/duration chips, expressed in
 * SECONDS (the stored values stay in ms; the chips convert). Kept distinct from
 * the internal ms bounds so the chip sliders read in plain seconds.
 */
export const CHIP_BOUNDS = {
  /** Transition (entry) duration slider: 0.1s .. 2.5s. */
  transitionSec: {min: 0.1, max: 2.5, step: 0.1},
  /** Slide hold (on-screen) duration slider: 0.5s .. 20s. */
  holdSec: {min: 0.5, max: 20, step: 0.5},
  /** Typewriter speed slider, characters per second. */
  charsPerSec: {min: 5, max: 60, step: 1},
} as const;
