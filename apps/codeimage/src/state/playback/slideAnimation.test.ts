import {describe, expect, it} from 'vitest';
import {DEFAULT_PLAYBACK_SETTINGS} from './model';
import {resolveEntryMode, resolveSlideInputs} from './slideAnimation';
import {buildTimeline, type PlaybackSettings} from './timeline';

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
      {transitionIn: 'fade' as const, holdMs: 500, transitionMs: 1200},
      {transitionIn: 'inherit' as const, typewriterCharMs: 40},
    ];
    const inputs = resolveSlideInputs(slides, [12, 6, 6], base);
    expect(inputs).toEqual([
      {
        charCount: 12,
        entryMode: 'typewriter',
        holdMs: undefined,
        typewriterCharMs: undefined,
        transitionMs: undefined,
      },
      {
        charCount: 6,
        entryMode: 'fade',
        holdMs: 500,
        typewriterCharMs: undefined,
        transitionMs: 1200,
      },
      {
        charCount: 6,
        entryMode: 'morph',
        holdMs: undefined,
        typewriterCharMs: 40,
        transitionMs: undefined,
      },
    ]);
  });

  it('missing code lengths default to 0', () => {
    const inputs = resolveSlideInputs([{}], [], base);
    expect(inputs[0].charCount).toBe(0);
  });
});

describe('default 3-slide deck timeline (complaint B/C regression)', () => {
  // A fresh deck has no per-slide overrides at all (transitionIn/transitionMs
  // undefined). This guards the user's core expectation: with untouched defaults
  // every slide boundary plays a visible, non-zero morph transition — not a
  // zero-duration hard cut. Uses the SHIPPED defaults, not a fixture, so a
  // regression in DEFAULT_PLAYBACK_SETTINGS (e.g. losing defaultTransition or
  // transitionMs) is caught here.
  it('produces a non-zero morph transition on every boundary with untouched defaults', () => {
    const plainSlides = [{}, {}, {}]; // three slides, no overrides
    const inputs = resolveSlideInputs(
      plainSlides,
      [180, 30, 690],
      DEFAULT_PLAYBACK_SETTINGS,
    );

    // Slide 0 inherits typingIntro (on) => typewriter; slides 1..2 => default morph.
    expect(inputs.map(i => i.entryMode)).toEqual([
      'typewriter',
      'morph',
      'morph',
    ]);

    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    // Two boundaries (1->2 and 2->3), each an 800ms morph — never 0/undefined.
    expect(transitions).toHaveLength(2);
    for (const seg of transitions) {
      expect(seg.mode).toBe('morph');
      expect(seg.durationMs).toBe(DEFAULT_PLAYBACK_SETTINGS.transitionMs);
      expect(seg.durationMs).toBeGreaterThan(0);
    }
  });

  it('honours a per-slide transitionMs override on an otherwise-default deck', () => {
    // The transition picker writes ms into slides[i].transitionMs; the timeline
    // must use it for that boundary and the global default for the others.
    const slides = [{}, {transitionMs: 2000}, {}];
    const inputs = resolveSlideInputs(
      slides,
      [180, 30, 690],
      DEFAULT_PLAYBACK_SETTINGS,
    );
    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    // Boundary into slide 1 uses the override (2000ms); into slide 2 the default.
    expect(transitions[0].durationMs).toBe(2000);
    expect(transitions[1].durationMs).toBe(DEFAULT_PLAYBACK_SETTINGS.transitionMs);
  });
});
