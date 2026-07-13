import {getSlidesStore} from '@codeimage/store/slides';
import {Tooltip} from '@codeui/kit';
import clsx from 'clsx';
import {createEffect, For, on, Show} from 'solid-js';
import {PlusIcon} from '../Icons/PlusIcon';
import {DurationChip} from './DurationChip';
import {DuplicateIcon, TrashIcon} from './FilmstripIcons';
import * as styles from './Filmstrip.css';
import {SlideThumbnail} from './SlideThumbnail';
import {TransitionPicker} from './TransitionPicker';
import * as chipStyles from './TransitionChip.css';

/**
 * The slide filmstrip: a horizontally-scrolling row of miniature slide previews
 * with per-card actions (settings / duplicate / delete), reorder controls, and
 * an add-slide card. Supports keyboard navigation, auto-scrolls the active card
 * into view, and disables itself during playback/export.
 */
export function Filmstrip() {
  const slidesStore = getSlidesStore();

  // Card refs keyed by index so we can scroll the active one into view on switch.
  const cardRefs: (HTMLButtonElement | undefined)[] = [];

  const isSingleSlide = () => slidesStore.state.slides.length <= 1;
  const disabled = () => slidesStore.playbackMode;

  // Auto-scroll the active card into view whenever the active index changes.
  createEffect(
    on(
      () => slidesStore.state.activeSlideIndex,
      activeIndex => {
        const card = cardRefs[activeIndex];
        card?.scrollIntoView({
          behavior: 'smooth',
          inline: 'nearest',
          block: 'nearest',
        });
      },
    ),
  );

  // Keyboard nav when the strip (or something inside it) is focused: arrows move
  // the active slide, Delete/Backspace removes it (guarded to keep >= 1 slide).
  function onKeyDown(event: KeyboardEvent) {
    if (disabled()) return;
    const {activeSlideIndex, slides} = slidesStore.state;

    if (event.key === 'ArrowLeft' && activeSlideIndex > 0) {
      event.preventDefault();
      slidesStore.actions.setActiveSlide(activeSlideIndex - 1);
    } else if (
      event.key === 'ArrowRight' &&
      activeSlideIndex < slides.length - 1
    ) {
      event.preventDefault();
      slidesStore.actions.setActiveSlide(activeSlideIndex + 1);
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      slides.length > 1
    ) {
      event.preventDefault();
      slidesStore.actions.removeSlide(activeSlideIndex);
    }
  }

  return (
    <div
      class={clsx(
        styles.filmstripWrapper,
        disabled() && styles.filmstripDisabled,
      )}
      role="tablist"
      aria-label="Slides"
      aria-disabled={disabled()}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <For each={slidesStore.state.slides}>
        {(slide, index) => {
          const isActive = () => slidesStore.state.activeSlideIndex === index();

          return (
            <>
              {/*
                Transition chip in the gap BEFORE this card. Chip `index()` edits
                slide `index()`'s incoming transition — the intro (index 0) or the
                transition INTO this slide from the previous one. Hidden entirely on
                a single-slide deck: with one slide the lone "intro" chip is noise
                (there is nothing to transition between), and the typing intro stays
                reachable from the Presentation panel toggle. With N>=2 slides this
                renders the intro chip (index 0) plus one chip per gap (indices
                1..N-1) — N chips total, one per boundary.
              */}
              <Show when={!isSingleSlide()}>
                <div class={chipStyles.chipSlot}>
                  <TransitionPicker boundaryIndex={index()} />
                </div>
              </Show>

              <button
                ref={el => (cardRefs[index()] = el)}
                type="button"
                role="tab"
                aria-selected={isActive()}
                aria-label={`Slide ${index() + 1}`}
                class={clsx(
                  styles.slideCard,
                  isActive() && styles.slideCardActive,
                )}
                onClick={() => slidesStore.actions.setActiveSlide(index())}
              >
                <SlideThumbnail slide={slide} />

                <span class={styles.slideNumber}>{index() + 1}</span>

                {/* Duration ("2.5s") chip pinned bottom-right. */}
                <div onClick={e => e.stopPropagation()}>
                  <DurationChip index={index()} slide={slide} />
                </div>

                {/* Hover/focus action overlay (duplicate / delete) */}
                <div
                  class={styles.slideActions}
                  onClick={e => e.stopPropagation()}
                >
                  <Tooltip
                    content={'Duplicate slide'}
                    theme={'secondary'}
                    placement={'top'}
                  >
                    <button
                      type="button"
                      class={styles.actionIconBtn}
                      aria-label="Duplicate slide"
                      onClick={() =>
                        slidesStore.actions.duplicateSlide(index())
                      }
                    >
                      <DuplicateIcon size={'xs'} />
                    </button>
                  </Tooltip>

                  <Tooltip
                    content={
                      isSingleSlide()
                        ? 'A deck needs at least one slide'
                        : 'Delete slide'
                    }
                    theme={'secondary'}
                    placement={'top'}
                  >
                    <button
                      type="button"
                      class={styles.actionIconBtn}
                      aria-label="Delete slide"
                      onClick={() => slidesStore.actions.removeSlide(index())}
                      disabled={isSingleSlide()}
                    >
                      <TrashIcon size={'xs'} />
                    </button>
                  </Tooltip>
                </div>
              </button>
            </>
          );
        }}
      </For>

      {/* Reorder buttons for the active slide */}
      <div class={styles.reorderButtons}>
        <Tooltip
          content={'Move slide left'}
          theme={'secondary'}
          placement={'top'}
        >
          <button
            type="button"
            class={styles.reorderButton}
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
        </Tooltip>
        <Tooltip
          content={'Move slide right'}
          theme={'secondary'}
          placement={'bottom'}
        >
          <button
            type="button"
            class={styles.reorderButton}
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
        </Tooltip>
      </div>

      {/* Add slide card */}
      <Tooltip content={'Add slide'} theme={'secondary'} placement={'top'}>
        <button
          type="button"
          class={styles.addCard}
          aria-label="Add slide"
          onClick={() => slidesStore.actions.addSlide()}
        >
          <PlusIcon size={'md'} />
        </button>
      </Tooltip>
    </div>
  );
}
