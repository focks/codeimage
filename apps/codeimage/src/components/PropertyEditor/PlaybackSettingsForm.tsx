import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {PLAYBACK_SETTINGS_BOUNDS} from '@codeimage/store/playback/model';
import {DEFAULT_TRANSITION, type EntryMode} from '@codeimage/store/playback/timeline';
import {createSelectOptions, NumberField, Select} from '@codeui/kit';
import {SegmentedField} from '@ui/SegmentedField/SegmentedField';
import type {ParentComponent} from 'solid-js';
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

// Global playback DEFAULTS. Each slide can override these via its filmstrip gear;
// a slide that inherits uses the values configured here. `typingIntro` = "slide 1
// types itself in by default"; `defaultTransition` = the mode inheriting slides use.
export const PlaybackSettingsForm: ParentComponent = () => {
  const playback = getPlaybackStore();
  const bounds = PLAYBACK_SETTINGS_BOUNDS;

  // NumberField emits number | null | undefined; drop nullish before dispatch.
  const onNumber = (fn: (value: number) => void) => (value?: number | null) => {
    if (typeof value === 'number' && !Number.isNaN(value)) fn(value);
  };

  const defaultTransitionSelect = createSelectOptions(
    DEFAULT_TRANSITION_OPTIONS,
    {key: 'label', valueKey: 'value'},
  );

  return (
    <>
      <PanelHeader label={'Playback'} />

      <PanelRow for={'defaultTransitionField'} label={'Default transition'}>
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

      <PanelRow for={'typingIntroField'} label={'Type in slide 1'}>
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

      <PanelRow for={'typingSpeedField'} label={'Typing speed (cps)'}>
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'typingSpeedField'}
            min={bounds.typingCharsPerSec.min}
            max={bounds.typingCharsPerSec.max}
            step={bounds.typingCharsPerSec.step}
            value={playback.settings.typingCharsPerSec}
            onChange={onNumber(playback.actions.setTypingCharsPerSec)}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'holdField'} label={'Default hold (ms)'}>
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'holdField'}
            min={bounds.holdMs.min}
            max={bounds.holdMs.max}
            step={bounds.holdMs.step}
            value={playback.settings.holdMs}
            onChange={onNumber(playback.actions.setHoldMs)}
          />
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'transitionField'} label={'Transition (ms)'} /* fade/slide/morph duration */>
        <TwoColumnPanelRow>
          <NumberField
            size={'xs'}
            id={'transitionField'}
            min={bounds.transitionMs.min}
            max={bounds.transitionMs.max}
            step={bounds.transitionMs.step}
            value={playback.settings.transitionMs}
            onChange={onNumber(playback.actions.setTransitionMs)}
          />
        </TwoColumnPanelRow>
      </PanelRow>
    </>
  );
};
