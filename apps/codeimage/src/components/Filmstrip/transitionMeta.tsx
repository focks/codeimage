import type {EntryMode} from '@codeimage/store/playback/timeline';
import type {SvgIconProps} from '@codeimage/ui';
import type {Component} from 'solid-js';
import {
  TransitionFadeIcon,
  TransitionMorphIcon,
  TransitionNoneIcon,
  TransitionSlideIcon,
  TransitionTypewriterIcon,
} from './FilmstripIcons';

/** UI metadata for each concrete transition mode: label + distinct mini-icon. */
export interface TransitionMeta {
  readonly mode: EntryMode;
  readonly label: string;
  readonly Icon: Component<SvgIconProps>;
  /** One-line plain-language description shown as a tooltip / picker hint. */
  readonly hint: string;
}

export const TRANSITION_META: Readonly<Record<EntryMode, TransitionMeta>> = {
  none: {
    mode: 'none',
    label: 'None',
    Icon: TransitionNoneIcon,
    hint: 'Cut straight to the next slide — no animation.',
  },
  fade: {
    mode: 'fade',
    label: 'Fade',
    Icon: TransitionFadeIcon,
    hint: 'Cross-dissolve the whole block into the next slide.',
  },
  slide: {
    mode: 'slide',
    label: 'Slide',
    Icon: TransitionSlideIcon,
    hint: 'Changed lines slide in from the right.',
  },
  morph: {
    mode: 'morph',
    label: 'Morph',
    Icon: TransitionMorphIcon,
    hint: 'Matching code stays put; the rest cross-dissolves (magic move).',
  },
  typewriter: {
    mode: 'typewriter',
    label: 'Typewriter',
    Icon: TransitionTypewriterIcon,
    hint: 'Type the new slide in, character by character.',
  },
};

/** Ordered list for the 5-option picker grid: None / Fade / Slide / Morph / Type. */
export const TRANSITION_ORDER: readonly EntryMode[] = [
  'none',
  'fade',
  'slide',
  'morph',
  'typewriter',
];
