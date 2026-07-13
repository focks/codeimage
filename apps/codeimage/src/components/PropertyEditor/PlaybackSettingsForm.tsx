import {CHIP_BOUNDS} from '@codeimage/store/playback/model';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {DEFAULT_TRANSITION, type EntryMode} from '@codeimage/store/playback/timeline';
import {
  msToSeconds,
  secondsToMs,
} from '@codeimage/store/playback/units';
import {
  createSelectOptions,
  NumberField,
  Select,
  Tooltip,
} from '@codeui/kit';
import {SegmentedField} from '@ui/SegmentedField/SegmentedField';
import type {JSXElement, ParentComponent} from 'solid-js';
import {PanelHeader} from './PanelHeader';
import {PanelRow, TwoColumnPanelRow} from './PanelRow';

// Concrete default transition modes (no `inherit` — this IS the inherited value).
const DEFAULT_TRANSITION_OPTIONS: readonly {label: string; value: EntryMode}[] = [
  {label: 'None', value: 'none'},
  {label: 'Fade', value: 'fade'},
  {label: 'Slide', value: 'slide'},
  {label: 'Morph', value: 'morph'},
  {label: 'Typewriter', value: 'typewriter'},
];

/** A panel-row label with a plain-language tooltip explaining the setting. */
function LabelWithHint(props: {label: string; hint: string}): JSXElement {
  return (
    <Tooltip content={props.hint} theme={'secondary'} placement={'top'}>
      <span style={{'border-bottom': '1px dotted currentColor', cursor: 'help'}}>
        {props.label}
      </span>
    </Tooltip>
  );
}

/**
 * The "Presentation" panel: the deck-wide DEFAULTS every slide inherits unless it
 * overrides them via its filmstrip chips. Rewritten in plain language — all
 * user-facing durations are in SECONDS (stored internally in ms), no "hold"/"ms"
 * jargon — with a tooltip on each control. Matches the transition-picker wording.
 */
export const PlaybackSettingsForm: ParentComponent = () => {
  const playback = getPlaybackStore();

  const defaultTransitionSelect = createSelectOptions(
    DEFAULT_TRANSITION_OPTIONS,
    {key: 'label', valueKey: 'value'},
  );

  // NumberField emits number | null | undefined; drop nullish before dispatch.
  const onSeconds =
    (fn: (ms: number) => void) => (seconds?: number | null) => {
      if (typeof seconds === 'number' && !Number.isNaN(seconds)) {
        fn(secondsToMs(seconds));
      }
    };
  const onNumber = (fn: (value: number) => void) => (value?: number | null) => {
    if (typeof value === 'number' && !Number.isNaN(value)) fn(value);
  };

  return (
    <>
      <PanelHeader label={'Presentation'} />

      <PanelRow
        for={'defaultTransitionField'}
        label={
          <LabelWithHint
            label={'Default transition'}
            hint={'The animation new slides use unless you change it on a slide.'}
          />
        }
      >
        <TwoColumnPanelRow>
          {/*@ts-expect-error Fix @codeui/kit select types*/}
          <Select
            options={defaultTransitionSelect.options()}
            multiple={false}
            {...defaultTransitionSelect.props()}
            {...defaultTransitionSelect.controlled(
              () => playback.settings.defaultTransition ?? DEFAULT_TRANSITION,
              mode => playback.actions.setDefaultTransition(mode as EntryMode),
            )}
            aria-label={'Default transition'}
            size={'xs'}
            id={'defaultTransitionField'}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow
        for={'transitionField'}
        label={
          <LabelWithHint
            label={'Transition duration (s)'}
            hint={'How long each transition animation takes, in seconds.'}
          />
        }
      >
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'transitionField'}
            min={CHIP_BOUNDS.transitionSec.min}
            max={CHIP_BOUNDS.transitionSec.max}
            step={CHIP_BOUNDS.transitionSec.step}
            precision={1}
            value={msToSeconds(playback.settings.transitionMs)}
            onChange={onSeconds(playback.actions.setTransitionMs)}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow
        for={'holdField'}
        label={
          <LabelWithHint
            label={'Slide duration (s)'}
            hint={'How long each slide stays on screen, in seconds.'}
          />
        }
      >
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'holdField'}
            min={CHIP_BOUNDS.holdSec.min}
            max={CHIP_BOUNDS.holdSec.max}
            step={CHIP_BOUNDS.holdSec.step}
            precision={1}
            value={msToSeconds(playback.settings.holdMs)}
            onChange={onSeconds(playback.actions.setHoldMs)}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow
        for={'typingSpeedField'}
        label={
          <LabelWithHint
            label={'Typing speed (chars/s)'}
            hint={'For typewriter transitions: characters revealed per second.'}
          />
        }
      >
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'typingSpeedField'}
            min={CHIP_BOUNDS.charsPerSec.min}
            max={CHIP_BOUNDS.charsPerSec.max}
            step={CHIP_BOUNDS.charsPerSec.step}
            precision={0}
            value={playback.settings.typingCharsPerSec}
            onChange={onNumber(playback.actions.setTypingCharsPerSec)}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow
        for={'typingIntroField'}
        label={
          <LabelWithHint
            label={'Type out first slide'}
            hint={'Start the deck by typing the first slide in, character by character.'}
          />
        }
      >
        <TwoColumnPanelRow>
          <SegmentedField
            adapt
            id={'typingIntroField'}
            size={'xs'}
            value={playback.settings.typingIntro}
            onChange={playback.actions.setTypingIntro}
            items={[
              {label: 'On', value: true},
              {label: 'Off', value: false},
            ]}
          />
        </TwoColumnPanelRow>
      </PanelRow>
    </>
  );
};
