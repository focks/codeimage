import {CHIP_BOUNDS} from '@codeimage/store/playback/model';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {
  formatSecondsLabel,
  msToSeconds,
  secondsToMs,
} from '@codeimage/store/playback/units';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {NumberField, Popover, PopoverContent, PopoverTrigger, Tooltip} from '@codeui/kit';
import {createMemo} from 'solid-js';
import {ClockIcon} from './FilmstripIcons';
import * as styles from './TransitionChip.css';

/**
 * Canva-style "clock" chip on a slide thumbnail showing how long the slide stays
 * on screen (its hold duration). Clicking opens a small popover with a seconds
 * slider + numeric field and an "Apply to all" affordance. All units are seconds;
 * the stored value stays in ms.
 */
export function DurationChip(props: {index: number; slide: Slide}) {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();

  // Effective hold duration: per-slide override if set, else the global default.
  const effectiveHoldMs = createMemo(
    () => props.slide.holdMs ?? playback.settings.holdMs,
  );

  function onSeconds(seconds?: number | null) {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) return;
    slidesStore.actions.updateSlideSettings(props.index, {
      holdMs: secondsToMs(seconds),
    });
  }

  function applyToAll() {
    playback.actions.setHoldMs(effectiveHoldMs());
    for (let i = 0; i < slidesStore.state.slides.length; i++) {
      slidesStore.actions.updateSlideSettings(i, {holdMs: undefined});
    }
  }

  return (
    <Popover placement={'top'}>
      <Tooltip
        content={'How long this slide stays on screen'}
        theme={'secondary'}
        placement={'top'}
      >
        <PopoverTrigger
          as={'button'}
          class={styles.durationChip}
          aria-label={`Duration for slide ${props.index + 1}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <ClockIcon class={styles.durationChipIcon} />
          {formatSecondsLabel(effectiveHoldMs())}
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent title={'Slide duration'}>
        <div class={styles.durationPanel} onClick={e => e.stopPropagation()}>
          <div class={styles.sectionLabel}>On screen (seconds)</div>
          <div class={styles.fieldRow}>
            <input
              type={'range'}
              class={styles.rangeInput}
              min={CHIP_BOUNDS.holdSec.min}
              max={CHIP_BOUNDS.holdSec.max}
              step={CHIP_BOUNDS.holdSec.step}
              value={msToSeconds(effectiveHoldMs())}
              aria-label={'Slide duration (seconds)'}
              onInput={e => onSeconds(Number(e.currentTarget.value))}
            />
            <div class={styles.numericField}>
              <NumberField
                size={'xs'}
                aria-label={'Slide duration in seconds'}
                min={CHIP_BOUNDS.holdSec.min}
                max={CHIP_BOUNDS.holdSec.max}
                step={CHIP_BOUNDS.holdSec.step}
                precision={1}
                value={msToSeconds(effectiveHoldMs())}
                onChange={onSeconds}
              />
            </div>
          </div>
          <div class={styles.actionsRow}>
            <span />
            <button
              type={'button'}
              class={styles.applyAllButton}
              onClick={applyToAll}
            >
              Apply to all
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
