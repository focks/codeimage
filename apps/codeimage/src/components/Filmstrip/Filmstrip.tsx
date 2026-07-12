import {getSlidesStore} from '@codeimage/store/slides';
import {For} from 'solid-js';
import clsx from 'clsx';
import * as styles from './Filmstrip.css';
import {SlideSettingsPopover} from './SlideSettingsPopover';

// ponytail: numbered cards only — real thumbnails when playback/render lands

export function Filmstrip() {
  const slidesStore = getSlidesStore();

  return (
    <div class={styles.filmstripWrapper} role="tablist" aria-label="Slides">
      <For each={slidesStore.state.slides}>
        {(slide, index) => {
          const isActive = () => slidesStore.state.activeSlideIndex === index();

          return (
            <div
              role="tab"
              aria-selected={isActive()}
              class={clsx(styles.slideCard, isActive() && styles.slideCardActive)}
              onClick={() => slidesStore.actions.setActiveSlide(index())}
              title={`Slide ${index() + 1}`}
            >
              <span class={styles.slideNumber}>{index() + 1}</span>

              {/* Per-card hover actions */}
              <div class={styles.slideActions} onClick={e => e.stopPropagation()}>
                <SlideSettingsPopover index={index()} slide={slide} />
                <button
                  class={styles.actionIconBtn}
                  title="Duplicate slide"
                  onClick={() => slidesStore.actions.duplicateSlide(index())}
                  aria-label="Duplicate"
                >
                  ⧉
                </button>
                <button
                  class={styles.actionIconBtn}
                  title="Delete slide"
                  onClick={() => slidesStore.actions.removeSlide(index())}
                  aria-label="Delete"
                  disabled={slidesStore.state.slides.length <= 1}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        }}
      </For>

      {/* Reorder buttons for active slide */}
      <div class={styles.reorderButtons}>
        <button
          class={styles.reorderButton}
          title="Move slide left"
          aria-label="Move slide left"
          disabled={slidesStore.state.activeSlideIndex === 0}
          onClick={() =>
            slidesStore.actions.reorderSlide(
              slidesStore.state.activeSlideIndex,
              slidesStore.state.activeSlideIndex - 1,
            )
          }
        >
          ◀
        </button>
        <button
          class={styles.reorderButton}
          title="Move slide right"
          aria-label="Move slide right"
          disabled={
            slidesStore.state.activeSlideIndex ===
            slidesStore.state.slides.length - 1
          }
          onClick={() =>
            slidesStore.actions.reorderSlide(
              slidesStore.state.activeSlideIndex,
              slidesStore.state.activeSlideIndex + 1,
            )
          }
        >
          ▶
        </button>
      </div>

      {/* Add slide card */}
      <button
        class={styles.addCard}
        title="Add slide"
        aria-label="Add slide"
        onClick={() => slidesStore.actions.addSlide()}
      >
        +
      </button>
    </div>
  );
}
