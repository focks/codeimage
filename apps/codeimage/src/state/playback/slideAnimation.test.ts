import {describe, expect, it} from 'vitest';
import {DEFAULT_PLAYBACK_SETTINGS} from './model';
import {resolveEntryMode, resolveSlideInputs} from './slideAnimation';
import {
  buildTimeline,
  charMsFromCharsPerSec,
  typewriterDurationMs,
  type PlaybackSettings,
} from './timeline';

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
  // every slide's text visibly types in (default transition is typewriter) —
  // never a zero-duration hard cut. Uses the SHIPPED defaults, not a fixture,
  // so a regression in DEFAULT_PLAYBACK_SETTINGS (e.g. losing defaultTransition
  // or the typing rate) is caught here.
  it('types every slide in with untouched defaults (non-zero entries)', () => {
    const plainSlides = [{}, {}, {}]; // three slides, no overrides
    const charCounts = [180, 30, 690];
    const inputs = resolveSlideInputs(
      plainSlides,
      charCounts,
      DEFAULT_PLAYBACK_SETTINGS,
    );

    // Slide 0 inherits typingIntro (on) => typewriter; slides 1..2 => default
    // transition, which also types the incoming slide's text.
    expect(inputs.map(i => i.entryMode)).toEqual([
      'typewriter',
      'typewriter',
      'typewriter',
    ]);

    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    const charMs = charMsFromCharsPerSec(
      DEFAULT_PLAYBACK_SETTINGS.typingCharsPerSec,
    );
    // Two boundaries (1->2 and 2->3), each typing the incoming slide's chars.
    expect(transitions).toHaveLength(2);
    transitions.forEach((seg, i) => {
      expect(seg.mode).toBe('typewriter');
      expect(seg.durationMs).toBe(
        typewriterDurationMs(charCounts[i + 1], charMs),
      );
      expect(seg.durationMs).toBeGreaterThan(0);
    });
  });

  it('honours a per-slide transitionMs override on an otherwise-default deck', () => {
    // The transition picker writes ms into slides[i].transitionMs; the timeline
    // must use it for that boundary. transitionMs only applies to non-typewriter
    // modes (typewriter is timed per character), so the overridden slide gets an
    // explicit fade while the untouched boundary keeps the typewriter default.
    const slides = [{}, {transitionIn: 'fade' as const, transitionMs: 2000}, {}];
    const charCounts = [180, 30, 690];
    const inputs = resolveSlideInputs(
      slides,
      charCounts,
      DEFAULT_PLAYBACK_SETTINGS,
    );
    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    // Boundary into slide 1 uses the override (2000ms fade); into slide 2 the
    // default typewriter timed by the incoming slide's length.
    expect(transitions[0].durationMs).toBe(2000);
    expect(transitions[1].durationMs).toBe(
      typewriterDurationMs(
        charCounts[2],
        charMsFromCharsPerSec(DEFAULT_PLAYBACK_SETTINGS.typingCharsPerSec),
      ),
    );
  });
});
