import type {Slide, SlidesState} from './model';

/** Returns state with a new slide appended after the current active index. */
export function reduceAddSlide(state: SlidesState, newSlide: Slide): SlidesState {
  return {
    slides: [...state.slides, newSlide],
    activeSlideIndex: state.slides.length,
  };
}

/** Returns state with a duplicate of `index` inserted after it. */
export function reduceDuplicateSlide(
  state: SlidesState,
  index: number,
  newId: string,
): SlidesState {
  const source = state.slides[index];
  if (!source) return state;
  const duplicate: Slide = {
    ...source,
    frame: {...source.frame},
    terminal: {...source.terminal},
    editor: {
      ...source.editor,
      editors: source.editor.editors.map(e => ({...e})),
      options: {...source.editor.options},
    },
    id: newId,
  };
  const updated = [
    ...state.slides.slice(0, index + 1),
    duplicate,
    ...state.slides.slice(index + 1),
  ];
  return {slides: updated, activeSlideIndex: index + 1};
}

/** Returns state with slide at `index` removed. Min 1 slide enforced. */
export function reduceRemoveSlide(
  state: SlidesState,
  index: number,
): SlidesState {
  if (state.slides.length <= 1) return state;
  const updated = state.slides.filter((_, i) => i !== index);
  const newIndex = Math.min(state.activeSlideIndex, updated.length - 1);
  return {slides: updated, activeSlideIndex: newIndex};
}

/** Returns state with slide moved from `from` to `to` index. */
export function reduceReorderSlide(
  state: SlidesState,
  from: number,
  to: number,
): SlidesState {
  if (from === to) return state;
  const slides = [...state.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  const newIndex =
    state.activeSlideIndex === from
      ? to
      : state.activeSlideIndex > from && state.activeSlideIndex <= to
      ? state.activeSlideIndex - 1
      : state.activeSlideIndex < from && state.activeSlideIndex >= to
      ? state.activeSlideIndex + 1
      : state.activeSlideIndex;
  return {slides, activeSlideIndex: newIndex};
}

/** Returns state with activeSlideIndex set to `index`. */
export function reduceSetActiveSlide(
  state: SlidesState,
  index: number,
): SlidesState {
  if (index === state.activeSlideIndex) return state;
  return {...state, activeSlideIndex: index};
}

/** Per-slide playback overrides patchable via the filmstrip transition chips. */
export type SlideSettingsPatch = Pick<
  Slide,
  'transitionIn' | 'transitionMs' | 'holdMs' | 'typewriterCharMs'
>;

/**
 * Returns state with the slide at `index` merged with `patch` (immutably). A
 * patch value of `undefined` clears that override back to "inherit global". No-op
 * if `index` is out of range.
 */
export function reduceUpdateSlideSettings(
  state: SlidesState,
  index: number,
  patch: SlideSettingsPatch,
): SlidesState {
  const target = state.slides[index];
  if (!target) return state;
  const updated: Slide = {...target, ...patch};
  return {
    ...state,
    slides: state.slides.map((slide, i) => (i === index ? updated : slide)),
  };
}
