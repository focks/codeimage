import {CHIP_BOUNDS} from '@codeimage/store/playback/model';
import {previewTransition} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {resolveEntryMode} from '@codeimage/store/playback/slideAnimation';
import {DEFAULT_TRANSITION, type EntryMode} from '@codeimage/store/playback/timeline';
import {
  charMsToCharsPerSec,
  charsPerSecToCharMs,
  msToSeconds,
  secondsToMs,
} from '@codeimage/store/playback/units';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {NumberField, Popover, PopoverContent, PopoverTrigger, Tooltip} from '@codeui/kit';
import {clsx} from 'clsx';
import {createMemo, For, Show} from 'solid-js';
import {TransitionMiniPreview} from './TransitionMiniPreview';
import {TRANSITION_META, TRANSITION_ORDER} from './transitionMeta';
import * as styles from './TransitionChip.css';

interface TransitionPickerProps {
  /**
   * The boundary this chip controls. `boundaryIndex` is a SLIDE index: 0 = the
   * intro (slide 0's entry), i>0 = the transition into slide i. The chip lives in
   * the gap BEFORE slide `boundaryIndex`, so it edits that slide's `transitionIn`.
   */
  boundaryIndex: number;
}

/**
 * Canva-style transition picker. Opens from a chip in the filmstrip gap and lets
 * the user pick the incoming slide's transition mode (with a hover mini preview
 * per option), tune its duration (or typing speed), reset to the global default,
 * or apply the choice to every boundary at once. Selecting a mode plays a one-shot
 * REAL preview of just that boundary on the canvas.
 */
export function TransitionPicker(props: TransitionPickerProps) {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();

  const isIntro = () => props.boundaryIndex === 0;
  const slide = (): Slide | undefined =>
    slidesStore.state.slides[props.boundaryIndex];

  // The concrete mode this boundary will actually play (inherit chain collapsed).
  const resolvedMode = createMemo<EntryMode>(() => {
    const s = slide();
    return resolveEntryMode(
      s?.transitionIn,
      props.boundaryIndex === 0,
      playback.settings,
    );
  });

  // True when this boundary overrides the global default (accent-tinted chip).
  const isOverridden = createMemo(() => {
    const t = slide()?.transitionIn;
    return t != null && t !== 'inherit';
  });

  // Effective entry duration in ms for the CURRENT resolved mode: per-slide
  // override if set, else the global default.
  const effectiveTransitionMs = createMemo(() => {
    const s = slide();
    return s?.transitionMs ?? playback.settings.transitionMs;
  });

  // Effective typing speed (chars/sec) for a typewriter entry.
  const effectiveCharsPerSec = createMemo(() => {
    const s = slide();
    return s?.typewriterCharMs != null
      ? charMsToCharsPerSec(s.typewriterCharMs)
      : playback.settings.typingCharsPerSec;
  });

  function pick(mode: EntryMode) {
    // Set the per-slide override, then play a one-shot preview of this boundary.
    slidesStore.actions.updateSlideSettings(props.boundaryIndex, {
      transitionIn: mode,
    });
    previewTransition(props.boundaryIndex);
  }

  function onDurationSeconds(seconds?: number | null) {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) return;
    slidesStore.actions.updateSlideSettings(props.boundaryIndex, {
      transitionMs: secondsToMs(seconds),
    });
  }

  function onCharsPerSec(cps?: number | null) {
    if (typeof cps !== 'number' || Number.isNaN(cps) || cps <= 0) return;
    slidesStore.actions.updateSlideSettings(props.boundaryIndex, {
      typewriterCharMs: charsPerSecToCharMs(cps),
    });
  }

  function resetToDefault() {
    slidesStore.actions.updateSlideSettings(props.boundaryIndex, {
      transitionIn: undefined,
      transitionMs: undefined,
      typewriterCharMs: undefined,
    });
  }

  // Apply this boundary's mode + duration as the GLOBAL default and clear every
  // per-slide override so the whole deck inherits one consistent transition.
  function applyToAll() {
    const mode = resolvedMode();
    if (mode !== 'typewriter') {
      playback.actions.setDefaultTransition(mode);
      playback.actions.setTransitionMs(effectiveTransitionMs());
    } else {
      playback.actions.setDefaultTransition('typewriter');
      playback.actions.setTypingCharsPerSec(effectiveCharsPerSec());
    }
    for (let i = 0; i < slidesStore.state.slides.length; i++) {
      slidesStore.actions.updateSlideSettings(i, {
        transitionIn: undefined,
        transitionMs: undefined,
        typewriterCharMs: undefined,
      });
    }
  }

  const title = () => (isIntro() ? 'Intro' : 'Transition');

  return (
    <Popover placement={'top'}>
      <Tooltip
        content={
          isIntro()
            ? `Intro: ${TRANSITION_META[resolvedMode()].label}`
            : `Transition: ${TRANSITION_META[resolvedMode()].label}`
        }
        theme={'secondary'}
        placement={'top'}
      >
        <PopoverTrigger
          as={'button'}
          class={clsx(
            styles.transitionChip,
            isOverridden() && styles.transitionChipOverridden,
          )}
          aria-label={`${title()} for slide ${props.boundaryIndex + 1}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {(() => {
            const Icon = TRANSITION_META[resolvedMode()].Icon;
            return <Icon size={'xs'} />;
          })()}
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent title={title()}>
        <div class={styles.pickerPanel} onClick={e => e.stopPropagation()}>
          <div class={styles.optionGrid}>
            <For each={TRANSITION_ORDER}>
              {mode => {
                const meta = TRANSITION_META[mode];
                const selected = () => resolvedMode() === mode;
                return (
                  <button
                    type={'button'}
                    class={clsx(
                      styles.optionCard,
                      selected() && styles.optionCardSelected,
                    )}
                    aria-pressed={selected()}
                    aria-label={meta.label}
                    onClick={() => pick(mode)}
                  >
                    <TransitionMiniPreview mode={mode} />
                    <span class={styles.optionLabel}>{meta.label}</span>
                  </button>
                );
              }}
            </For>
          </div>

          <div class={styles.hintText}>{TRANSITION_META[resolvedMode()].hint}</div>

          {/* Duration for fade/slide/morph; typing speed for typewriter. */}
          <Show
            when={resolvedMode() === 'typewriter'}
            fallback={
              <Show when={resolvedMode() !== 'none'}>
                <div class={styles.sectionLabel}>Duration</div>
                <div class={styles.fieldRow}>
                  <input
                    type={'range'}
                    class={styles.rangeInput}
                    min={CHIP_BOUNDS.transitionSec.min}
                    max={CHIP_BOUNDS.transitionSec.max}
                    step={CHIP_BOUNDS.transitionSec.step}
                    value={msToSeconds(effectiveTransitionMs())}
                    aria-label={'Transition duration (seconds)'}
                    onInput={e =>
                      onDurationSeconds(Number(e.currentTarget.value))
                    }
                  />
                  <div class={styles.numericField}>
                    <NumberField
                      size={'xs'}
                      aria-label={'Transition duration in seconds'}
                      min={CHIP_BOUNDS.transitionSec.min}
                      max={CHIP_BOUNDS.transitionSec.max}
                      step={CHIP_BOUNDS.transitionSec.step}
                      precision={1}
                      value={msToSeconds(effectiveTransitionMs())}
                      onChange={onDurationSeconds}
                    />
                  </div>
                </div>
              </Show>
            }
          >
            <div class={styles.sectionLabel}>Speed (chars/sec)</div>
            <div class={styles.fieldRow}>
              <input
                type={'range'}
                class={styles.rangeInput}
                min={CHIP_BOUNDS.charsPerSec.min}
                max={CHIP_BOUNDS.charsPerSec.max}
                step={CHIP_BOUNDS.charsPerSec.step}
                value={effectiveCharsPerSec()}
                aria-label={'Typing speed (characters per second)'}
                onInput={e => onCharsPerSec(Number(e.currentTarget.value))}
              />
              <div class={styles.numericField}>
                <NumberField
                  size={'xs'}
                  aria-label={'Typing speed in characters per second'}
                  min={CHIP_BOUNDS.charsPerSec.min}
                  max={CHIP_BOUNDS.charsPerSec.max}
                  step={CHIP_BOUNDS.charsPerSec.step}
                  precision={0}
                  value={effectiveCharsPerSec()}
                  onChange={onCharsPerSec}
                />
              </div>
            </div>
          </Show>

          <div class={styles.actionsRow}>
            <Show when={isOverridden()}>
              <button
                type={'button'}
                class={styles.textButton}
                onClick={resetToDefault}
              >
                Reset to default
              </button>
            </Show>
            <button
              type={'button'}
              class={styles.applyAllButton}
              onClick={applyToAll}
            >
              Apply between all slides
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
