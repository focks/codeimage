import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {PLAYBACK_SETTINGS_BOUNDS} from '@codeimage/store/playback/model';
import {NumberField} from '@codeui/kit';
import {SegmentedField} from '@ui/SegmentedField/SegmentedField';
import type {ParentComponent} from 'solid-js';
import {PanelHeader} from './PanelHeader';
import {PanelRow, TwoColumnPanelRow} from './PanelRow';

// Global playback settings (v1): typing intro toggle + typing speed, hold, and
// transition durations. Kept global rather than per-slide, per the phase-2 spec.
export const PlaybackSettingsForm: ParentComponent = () => {
  const playback = getPlaybackStore();
  const bounds = PLAYBACK_SETTINGS_BOUNDS;

  // NumberField emits number | null | undefined; drop nullish before dispatch.
  const onNumber = (fn: (value: number) => void) => (value?: number | null) => {
    if (typeof value === 'number' && !Number.isNaN(value)) fn(value);
  };

  return (
    <>
      <PanelHeader label={'Playback'} />

      <PanelRow for={'typingIntroField'} label={'Typing intro'}>
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

      <PanelRow for={'holdField'} label={'Hold (ms)'}>
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

      <PanelRow for={'transitionField'} label={'Transition (ms)'}>
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
