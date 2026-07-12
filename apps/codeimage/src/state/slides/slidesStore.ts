import {getRootEditorStore} from '@codeimage/store/editor';
import {getFrameState} from '@codeimage/store/editor/frame';
import {getTerminalState} from '@codeimage/store/editor/terminal';
import {generateUid} from '@codeimage/store/plugins/unique-id';
import {debounceTime, filter, merge} from 'rxjs';
import {createEffect, createSignal, on, onCleanup, onMount, untrack} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {useIdb} from '../../hooks/use-indexed-db';
import {
  SLIDES_IDB_KEY,
  SLIDES_VERSION,
  type PersistedSlidesState,
  type Slide,
  type SlidesState,
} from './model';
import {
  reduceAddSlide,
  reduceDuplicateSlide,
  reduceRemoveSlide,
  reduceReorderSlide,
  reduceSetActiveSlide,
  reduceUpdateSlideSettings,
  type SlideSettingsPatch,
} from './slideReducers';

/** Build a snapshot of the live stores into a Slide. */
function snapshotLiveStores(
  id: string,
  frameStore: ReturnType<typeof getFrameState>,
  terminalStore: ReturnType<typeof getTerminalState>,
  editorStore: ReturnType<typeof getRootEditorStore>,
): Slide {
  return {
    id,
    frame: frameStore.stateToPersist(),
    terminal: terminalStore.stateToPersist(),
    editor: editorStore.stateToPersist(),
  };
}

/** Flush a Slide's data into the live stores (mirrors the startup hydration). */
function loadSlideIntoStores(
  slide: Slide,
  frameStore: ReturnType<typeof getFrameState>,
  terminalStore: ReturnType<typeof getTerminalState>,
  editorStore: ReturnType<typeof getRootEditorStore>,
): void {
  editorStore.actions.setFromPersistedState(slide.editor);
  frameStore.setFromPersistedState(slide.frame);
  terminalStore.setFromPersistedState(slide.terminal);
}

export function createSlidesStore() {
  const idb = useIdb();
  const frameStore = getFrameState();
  const terminalStore = getTerminalState();
  const editorStore = getRootEditorStore();

  const [state, setState] = createSignal<SlidesState>({
    slides: [],
    activeSlideIndex: 0,
  });

  // During playback the animation view reads slides[i] directly and applies
  // chrome styles to the live stores without persisting. This flag suppresses
  // the flush/persist subscriptions so playback never mutates saved slide data.
  const [playbackMode, setPlaybackMode] = createSignal(false);

  const activeSlide = () => state().slides[state().activeSlideIndex] ?? null;

  // ── Snapshot the active slide with the current live-store data ──────────
  function flushCurrentSlideSnapshot(): void {
    const current = state();
    const slide = current.slides[current.activeSlideIndex];
    if (!slide) return;
    // Per-slide playback overrides (transitionIn/holdMs/typewriterCharMs) live
    // only on the Slide, not in any live store, so re-snapshotting from the live
    // stores alone would drop them. Preserve them by spreading the prior slide.
    const updated: Slide = {
      ...slide,
      ...snapshotLiveStores(
        slide.id,
        frameStore,
        terminalStore,
        editorStore,
      ),
    };
    setState(s => ({
      ...s,
      slides: s.slides.map((sl, i) =>
        i === s.activeSlideIndex ? updated : sl,
      ),
    }));
  }

  // ── Watch live stores for changes, flush into the active slide entry ────
  const onChange$ = merge(
    frameStore.stateToPersist$,
    terminalStore.stateToPersist$,
    editorStore.stateToPersist$,
  ).pipe(filter(() => state().slides.length > 0));

  // ── Persist slides state to IndexedDB ───────────────────────────────────
  function persistToIdb(): void {
    const current = untrack(state);
    const persisted: PersistedSlidesState = unwrap({
      $version: SLIDES_VERSION,
      slides: current.slides,
      activeSlideIndex: current.activeSlideIndex,
    });
    idb.set(SLIDES_IDB_KEY, persisted);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  function addSlide(): void {
    flushCurrentSlideSnapshot();
    const newSlide: Slide = snapshotLiveStores(
      generateUid(),
      frameStore,
      terminalStore,
      editorStore,
    );
    setState(s => reduceAddSlide(s, newSlide));
    // New slide is already identical to live stores — no need to reload
  }

  function duplicateSlide(index: number): void {
    flushCurrentSlideSnapshot();
    setState(s => reduceDuplicateSlide(s, index, generateUid()));
    // Load the newly active (duplicated) slide into live stores
    const target = state().slides[state().activeSlideIndex];
    if (target) {
      loadSlideIntoStores(target, frameStore, terminalStore, editorStore);
    }
  }

  function removeSlide(index: number): void {
    setState(s => reduceRemoveSlide(s, index));
    const target = state().slides[state().activeSlideIndex];
    if (target) {
      loadSlideIntoStores(target, frameStore, terminalStore, editorStore);
    }
  }

  function reorderSlide(from: number, to: number): void {
    flushCurrentSlideSnapshot();
    setState(s => reduceReorderSlide(s, from, to));
  }

  function setActiveSlide(index: number): void {
    if (index === state().activeSlideIndex) return;
    flushCurrentSlideSnapshot();
    setState(s => reduceSetActiveSlide(s, index));
    const target = state().slides[index];
    if (target) {
      loadSlideIntoStores(target, frameStore, terminalStore, editorStore);
    }
  }

  // Patch a slide's per-slide playback overrides (transitionIn/hold/typewriter).
  // Pure metadata on the slide — no live-store reload needed; the `on(state)`
  // effect persists the change.
  function updateSlideSettings(index: number, patch: SlideSettingsPatch): void {
    setState(s => reduceUpdateSlideSettings(s, index, patch));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMount(async () => {
    let loaded: PersistedSlidesState | undefined;
    try {
      loaded = await idb.get<PersistedSlidesState>(SLIDES_IDB_KEY);
    } catch {
      loaded = undefined;
    }

    if (loaded && loaded.slides && loaded.slides.length > 0) {
      const safeIndex = Math.min(
        loaded.activeSlideIndex ?? 0,
        loaded.slides.length - 1,
      );
      setState({slides: loaded.slides, activeSlideIndex: safeIndex});
      const target = loaded.slides[safeIndex];
      if (target) {
        loadSlideIntoStores(target, frameStore, terminalStore, editorStore);
      }
    } else {
      // No saved slides — snapshot the current live state as slide #1
      const initial: Slide = snapshotLiveStores(
        generateUid(),
        frameStore,
        terminalStore,
        editorStore,
      );
      setState({slides: [initial], activeSlideIndex: 0});
    }

    // Subscribe to live-store changes: keep slides[activeIndex] in sync + persist
    const sub = onChange$.pipe(debounceTime(300)).subscribe(() => {
      if (playbackMode()) return; // suppressed during playback
      flushCurrentSlideSnapshot();
      persistToIdb();
    });
    onCleanup(() => sub.unsubscribe());
  });

  // Persist whenever slides state itself changes (add/remove/reorder)
  createEffect(
    on(state, () => {
      if (playbackMode()) return; // suppressed during playback
      if (state().slides.length > 0) {
        persistToIdb();
      }
    }),
  );

  return {
    get state() {
      return state();
    },
    get playbackMode() {
      return playbackMode();
    },
    activeSlide,
    /** Snapshot live stores into the active slide (data-loss guard before play). */
    flushCurrentSlideSnapshot,
    /** Push a slide's chrome/editor into live stores without flushing back. */
    loadSlideIntoStores(slide: Slide): void {
      loadSlideIntoStores(slide, frameStore, terminalStore, editorStore);
    },
    setPlaybackMode,
    actions: {
      addSlide,
      duplicateSlide,
      removeSlide,
      reorderSlide,
      setActiveSlide,
      updateSlideSettings,
    },
  } as const;
}

let _store: ReturnType<typeof createSlidesStore> | undefined;

export function getSlidesStore(): ReturnType<typeof createSlidesStore> {
  if (!_store) _store = createSlidesStore();
  return _store;
}
