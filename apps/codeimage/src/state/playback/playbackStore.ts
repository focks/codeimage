import {createEffect, createSignal, on, onMount, untrack} from 'solid-js';
import {useIdb} from '../../hooks/use-indexed-db';
import {
  DEFAULT_PLAYBACK_SETTINGS,
  PLAYBACK_IDB_KEY,
  PLAYBACK_VERSION,
  type PersistedPlaybackSettings,
} from './model';
import type {EntryMode, PlaybackSettings} from './timeline';
import type {ResolvedChrome} from './chromeInterpolation';

/** Background paint for the frame during playback (crossfade layers). */
export type PlaybackBackgroundLayers = ResolvedChrome['backgroundLayers'];

/**
 * Global playback settings + live playback state.
 *
 * Follows the slides-store module-singleton pattern (signals + manual IDB), not
 * statebuilder. `currentTimeMs` is set by the rAF preview loop and — in phase 3 —
 * by the fixed-step export driver; it is never read from a wall clock here.
 */
export function createPlaybackStore() {
  const idb = useIdb();

  const [settings, setSettings] = createSignal<PlaybackSettings>(
    DEFAULT_PLAYBACK_SETTINGS,
  );
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTimeMs, setCurrentTimeMs] = createSignal(0);
  // Frame background paint for the current playback frame. When null the Frame
  // renders its normal single background; when set, it paints the crossfade
  // layers so gradient/image slide transitions blend instead of snapping (P3).
  const [backgroundLayers, setBackgroundLayers] =
    createSignal<PlaybackBackgroundLayers | null>(null);
  // Interpolated frame CONTAINER height (px) for the current playback frame, or
  // `null` to fall back to content-driven sizing. AnimationView publishes this so
  // a slide with an EXPLICIT height follows that height during playback (window
  // stretched/clipped like the editor) and a transition eases smoothly between
  // two slides' followed heights instead of hard-swapping (problem: window jump).
  const [followedHeight, setFollowedHeight] = createSignal<number | null>(null);

  function patchSettings(patch: Partial<PlaybackSettings>): void {
    setSettings(s => ({...s, ...patch}));
  }

  function persistToIdb(): void {
    const persisted: PersistedPlaybackSettings = {
      $version: PLAYBACK_VERSION,
      settings: untrack(settings),
    };
    idb.set(PLAYBACK_IDB_KEY, persisted).catch(() => {
      /* best-effort persistence; ignore quota/serialization failures */
    });
  }

  onMount(async () => {
    try {
      const loaded = await idb.get<PersistedPlaybackSettings>(PLAYBACK_IDB_KEY);
      if (loaded?.settings) {
        // Merge over defaults so a bumped schema keeps missing keys sane.
        setSettings({...DEFAULT_PLAYBACK_SETTINGS, ...loaded.settings});
      }
    } catch {
      /* fall back to defaults */
    }

    // Persist settings changes only (playback state is transient).
    createEffect(on(settings, persistToIdb, {defer: true}));
  });

  return {
    get settings() {
      return settings();
    },
    get isPlaying() {
      return isPlaying();
    },
    get currentTimeMs() {
      return currentTimeMs();
    },
    get backgroundLayers() {
      return backgroundLayers();
    },
    get followedHeight() {
      return followedHeight();
    },
    setFollowedHeight,
    setBackgroundLayers,
    setIsPlaying,
    setCurrentTimeMs,
    actions: {
      setTypingIntro: (typingIntro: boolean) => patchSettings({typingIntro}),
      setTypingCharsPerSec: (typingCharsPerSec: number) =>
        patchSettings({typingCharsPerSec}),
      setHoldMs: (holdMs: number) => patchSettings({holdMs}),
      setTransitionMs: (transitionMs: number) => patchSettings({transitionMs}),
      setDefaultTransition: (defaultTransition: EntryMode) =>
        patchSettings({defaultTransition}),
    },
  } as const;
}

let _store: ReturnType<typeof createPlaybackStore> | undefined;

export function getPlaybackStore(): ReturnType<typeof createPlaybackStore> {
  if (!_store) _store = createPlaybackStore();
  return _store;
}
