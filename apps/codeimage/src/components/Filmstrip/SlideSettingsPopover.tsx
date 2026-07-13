import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide, SlideTransitionIn} from '@codeimage/store/slides/model';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {PLAYBACK_SETTINGS_BOUNDS} from '@codeimage/store/playback/model';
import {resolveEntryMode} from '@codeimage/store/playback/slideAnimation';
import {
  createSelectOptions,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Tooltip,
} from '@codeui/kit';
import {createMemo, Show} from 'solid-js';
import {SettingsIcon} from '../Icons/SettingsIcon';
import * as styles from './Filmstrip.css';

// Per-slide transition-in options. `inherit` maps to the global default mode.
const TRANSITION_IN_OPTIONS: readonly {
  label: string;
  value: SlideTransitionIn;
}[] = [
  {label: 'Inherit', value: 'inherit'},
  {label: 'None', value: 'none'},
  {label: 'Fade', value: 'fade'},
  {label: 'Slide', value: 'slide'},
  {label: 'Morph', value: 'morph'},
  {label: 'Typewriter', value: 'typewriter'},
];

interface SlideSettingsPopoverProps {
  index: number;
  slide: Slide;
}

/**
 * Per-slide playback settings, opened from a gear on each filmstrip card. Lets a
 * slide override the global default transition mode, hold duration, and (for a
 * typewriter entry) the per-character speed. Empty overrides mean "inherit".
 */
export function SlideSettingsPopover(props: SlideSettingsPopoverProps) {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const bounds = PLAYBACK_SETTINGS_BOUNDS;

  const transitionSelect = createSelectOptions(TRANSITION_IN_OPTIONS, {
    key: 'label',
    valueKey: 'value',
  });

  // The concrete mode this slide will actually play (inherit chain collapsed).
  const resolvedMode = createMemo(() =>
    resolveEntryMode(
      props.slide.transitionIn,
      props.index === 0,
      playback.settings,
    ),
  );

  // NumberField emits number | null | undefined; empty clears the override.
  const onHoldChange = (value?: number | null) => {
    slidesStore.actions.updateSlideSettings(props.index, {
      holdMs:
        typeof value === 'number' && !Number.isNaN(value) ? value : undefined,
    });
  };
  const onCharMsChange = (value?: number | null) => {
    slidesStore.actions.updateSlideSettings(props.index, {
      typewriterCharMs:
        typeof value === 'number' && !Number.isNaN(value) ? value : undefined,
    });
  };

  return (
    <Popover placement={'top'}>
      <Tooltip content={'Slide settings'} theme={'secondary'} placement={'top'}>
        <PopoverTrigger
          as={'button'}
          class={styles.actionIconBtn}
          aria-label={`Settings for slide ${props.index + 1}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <SettingsIcon size={'xs'} />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent title={`Slide ${props.index + 1} settings`}>
        <div
          class={styles.slideSettingsPanel}
          onClick={e => e.stopPropagation()}
        >
          <label class={styles.slideSettingsRow}>
            <span class={styles.slideSettingsLabel}>Transition in</span>
            {/*@ts-expect-error Fix @codeui/kit select types*/}
            <Select
              options={transitionSelect.options()}
              multiple={false}
              {...transitionSelect.props()}
              {...transitionSelect.controlled(
                () => props.slide.transitionIn ?? 'inherit',
                mode =>
                  slidesStore.actions.updateSlideSettings(props.index, {
                    transitionIn:
                      (mode as SlideTransitionIn) === 'inherit'
                        ? undefined
                        : (mode as SlideTransitionIn),
                  }),
              )}
              aria-label={'Transition in'}
              size={'xs'}
              id={`slide-${props.index}-transition`}
            />
          </label>

          <label class={styles.slideSettingsRow}>
            <span class={styles.slideSettingsLabel}>Hold (ms)</span>
            <NumberField
              size={'xs'}
              id={`slide-${props.index}-hold`}
              placeholder={'Inherit'}
              min={0}
              max={bounds.holdMs.max}
              step={bounds.holdMs.step}
              value={props.slide.holdMs ?? (undefined as unknown as number)}
              onChange={onHoldChange}
            />
          </label>

          <Show when={resolvedMode() === 'typewriter'}>
            <label class={styles.slideSettingsRow}>
              <span class={styles.slideSettingsLabel}>
                Type speed (ms/char)
              </span>
              <NumberField
                size={'xs'}
                id={`slide-${props.index}-charms`}
                placeholder={'Inherit'}
                min={bounds.typewriterCharMs.min}
                max={bounds.typewriterCharMs.max}
                step={bounds.typewriterCharMs.step}
                value={
                  props.slide.typewriterCharMs ??
                  (undefined as unknown as number)
                }
                onChange={onCharMsChange}
              />
            </label>
          </Show>
        </div>
      </PopoverContent>
    </Popover>
  );
}
