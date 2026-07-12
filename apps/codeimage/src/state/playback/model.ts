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
};

/** Reasonable UI bounds for the settings controls. */
export const PLAYBACK_SETTINGS_BOUNDS = {
  typingCharsPerSec: {min: 5, max: 120, step: 5},
  holdMs: {min: 500, max: 8000, step: 250},
  transitionMs: {min: 200, max: 3000, step: 100},
} as const;
