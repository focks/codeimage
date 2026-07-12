import {describe, expect, it} from 'vitest';
import type {Slide, SlidesState} from './model';
import {
  reduceAddSlide,
  reduceDuplicateSlide,
  reduceRemoveSlide,
  reduceReorderSlide,
  reduceSetActiveSlide,
} from './slideReducers';

function makeSlide(id: string): Slide {
  return {
    id,
    frame: {background: '#fff', padding: 64, radius: 8, visible: true, opacity: 100, minWidth: 0, minHeight: 0},
    terminal: {
      showHeader: true, type: 'macOS', accentVisible: true, shadow: null,
      background: '#000', textColor: '#fff', showWatermark: false,
      showGlassReflection: false, opacity: 100, alternativeTheme: false,
      borderType: null,
    },
    editor: {
      options: {fontId: 'jetbrains', fontWeight: 400, showLineNumbers: false, themeId: 'dark', enableLigatures: true},
      editors: [{id: 'e1', code: '// code', tabName: 'index.tsx', languageId: 'typescript', lineNumberStart: 1}],
    },
  };
}

function makeState(ids: string[], activeIndex = 0): SlidesState {
  return {slides: ids.map(makeSlide), activeSlideIndex: activeIndex};
}

// ── addSlide ──────────────────────────────────────────────────────────────
describe('reduceAddSlide', () => {
  it('appends slide and sets activeSlideIndex to the new slide', () => {
    const state = makeState(['a', 'b'], 1);
    const newSlide = makeSlide('c');
    const next = reduceAddSlide(state, newSlide);
    expect(next.slides).toHaveLength(3);
    expect(next.slides[2].id).toBe('c');
    expect(next.activeSlideIndex).toBe(2);
  });

  it('does not mutate original state', () => {
    const state = makeState(['a'], 0);
    const newSlide = makeSlide('b');
    const next = reduceAddSlide(state, newSlide);
    expect(state.slides).toHaveLength(1);
    expect(next).not.toBe(state);
  });
});

// ── duplicateSlide ─────────────────────────────────────────────────────────
describe('reduceDuplicateSlide', () => {
  it('inserts duplicate after source and activates it', () => {
    const state = makeState(['a', 'b', 'c'], 0);
    const next = reduceDuplicateSlide(state, 0, 'a-copy');
    expect(next.slides).toHaveLength(4);
    expect(next.slides[1].id).toBe('a-copy');
    expect(next.activeSlideIndex).toBe(1);
  });

  it('returns unchanged state for out-of-range index', () => {
    const state = makeState(['a'], 0);
    const next = reduceDuplicateSlide(state, 99, 'x');
    expect(next).toBe(state);
  });

  it('deep-copies the slide (no shared references)', () => {
    const state = makeState(['a'], 0);
    const next = reduceDuplicateSlide(state, 0, 'a2');
    next.slides[1].frame.padding = 999;
    expect(state.slides[0].frame.padding).toBe(64);
  });
});

// ── removeSlide ────────────────────────────────────────────────────────────
describe('reduceRemoveSlide', () => {
  it('removes slide at given index', () => {
    const state = makeState(['a', 'b', 'c'], 1);
    const next = reduceRemoveSlide(state, 1);
    expect(next.slides).toHaveLength(2);
    expect(next.slides.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('clamps activeSlideIndex when active slide is removed', () => {
    const state = makeState(['a', 'b'], 1);
    const next = reduceRemoveSlide(state, 1);
    expect(next.activeSlideIndex).toBe(0);
  });

  it('enforces minimum 1 slide', () => {
    const state = makeState(['a'], 0);
    const next = reduceRemoveSlide(state, 0);
    expect(next.slides).toHaveLength(1);
    expect(next).toBe(state); // unchanged identity
  });
});

// ── reorderSlide ───────────────────────────────────────────────────────────
describe('reduceReorderSlide', () => {
  it('moves slide forward', () => {
    const state = makeState(['a', 'b', 'c'], 0);
    const next = reduceReorderSlide(state, 0, 2);
    expect(next.slides.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves slide backward', () => {
    const state = makeState(['a', 'b', 'c'], 2);
    const next = reduceReorderSlide(state, 2, 0);
    expect(next.slides.map(s => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('tracks the active slide through a forward move', () => {
    // active=0 moves to index 2 → active follows to 2
    const state = makeState(['a', 'b', 'c'], 0);
    const next = reduceReorderSlide(state, 0, 2);
    expect(next.activeSlideIndex).toBe(2);
  });

  it('returns unchanged state when from === to', () => {
    const state = makeState(['a', 'b'], 0);
    const next = reduceReorderSlide(state, 1, 1);
    expect(next).toBe(state);
  });

  it('does not mutate original slides array', () => {
    const state = makeState(['a', 'b', 'c'], 0);
    const ids = state.slides.map(s => s.id);
    reduceReorderSlide(state, 0, 2);
    expect(state.slides.map(s => s.id)).toEqual(ids);
  });
});

// ── setActiveSlide ─────────────────────────────────────────────────────────
describe('reduceSetActiveSlide', () => {
  it('updates activeSlideIndex', () => {
    const state = makeState(['a', 'b', 'c'], 0);
    const next = reduceSetActiveSlide(state, 2);
    expect(next.activeSlideIndex).toBe(2);
  });

  it('returns same object when index unchanged', () => {
    const state = makeState(['a', 'b'], 1);
    const next = reduceSetActiveSlide(state, 1);
    expect(next).toBe(state);
  });
});
