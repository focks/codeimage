import {describe, expect, it} from 'vitest';
import {resolveEntryMode, resolveSlideInputs} from './slideAnimation';
import type {PlaybackSettings} from './timeline';

const base: PlaybackSettings = {
  typingIntro: true,
  typingCharsPerSec: 10,
  holdMs: 1000,
  transitionMs: 500,
  defaultTransition: 'morph',
};

describe('resolveEntryMode', () => {
  it('an explicit per-slide mode always wins', () => {
    expect(resolveEntryMode('fade', false, base)).toBe('fade');
    expect(resolveEntryMode('slide', true, base)).toBe('slide');
    // Even against typingIntro / default: explicit overrides both.
    expect(resolveEntryMode('none', true, base)).toBe('none');
  });

  it('inherit on a non-first slide => global default transition', () => {
    expect(resolveEntryMode('inherit', false, base)).toBe('morph');
    expect(resolveEntryMode(undefined, false, base)).toBe('morph');
    expect(
      resolveEntryMode(undefined, false, {...base, defaultTransition: 'slide'}),
    ).toBe('slide');
  });

  it('inherit on slide 0 follows the typingIntro toggle', () => {
    expect(resolveEntryMode(undefined, true, base)).toBe('typewriter');
    expect(
      resolveEntryMode('inherit', true, {...base, typingIntro: false}),
    ).toBe('none');
  });

  it('slide 0 explicit override beats the typingIntro toggle', () => {
    expect(
      resolveEntryMode('morph', true, {...base, typingIntro: true}),
    ).toBe('morph');
  });
});

describe('resolveSlideInputs', () => {
  it('collapses inherit chains + carries per-slide overrides', () => {
    const slides = [
      {}, // slide 0, inherits => typewriter (typingIntro on)
      {transitionIn: 'fade' as const, holdMs: 500},
      {transitionIn: 'inherit' as const, typewriterCharMs: 40},
    ];
    const inputs = resolveSlideInputs(slides, [12, 6, 6], base);
    expect(inputs).toEqual([
      {charCount: 12, entryMode: 'typewriter', holdMs: undefined, typewriterCharMs: undefined},
      {charCount: 6, entryMode: 'fade', holdMs: 500, typewriterCharMs: undefined},
      {charCount: 6, entryMode: 'morph', holdMs: undefined, typewriterCharMs: 40},
    ]);
  });

  it('missing code lengths default to 0', () => {
    const inputs = resolveSlideInputs([{}], [], base);
    expect(inputs[0].charCount).toBe(0);
  });
});
