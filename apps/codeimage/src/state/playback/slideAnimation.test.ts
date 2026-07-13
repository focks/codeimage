import {describe, expect, it} from 'vitest';
import {DEFAULT_PLAYBACK_SETTINGS} from './model';
import {resolveEntryMode, resolveSlideInputs} from './slideAnimation';
import {
  buildTimeline,
  charMsFromCharsPerSec,
  type PlaybackSettings,
} from './timeline';
import {typewriterEntryTotalMs} from './typewriterPhases';
import {entryTotalMs, windowSpec} from './entryPhases';

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

  // ── Aged-profile fallback: settings saved by an OLDER build have no
  //    `defaultTransition` key. Readers must fall back to DEFAULT_TRANSITION
  //    (typewriter) so those decks still type instead of hard-cutting. ─────────
  it('aged profile without defaultTransition falls back to typewriter', () => {
    // Mirrors an IDB record from before the key existed.
    const aged = {
      typingIntro: true,
      typingCharsPerSec: 30,
      holdMs: 2500,
      transitionMs: 800,
    } as PlaybackSettings; // defaultTransition intentionally absent
    // Slide 0 still types (governed by typingIntro, not the default).
    expect(resolveEntryMode(undefined, true, aged)).toBe('typewriter');
    // A non-first inheriting slide falls back to the DEFAULT_TRANSITION.
    expect(resolveEntryMode(undefined, false, aged)).toBe('typewriter');
  });

  it("typingIntro types slide 0 even when the stored default is 'morph'", () => {
    // The whole job of the intro toggle: independent of defaultTransition, an
    // inheriting slide 0 types when typingIntro is on. Slides 2+ still morph.
    const morphStored = {...base, defaultTransition: 'morph' as const};
    expect(resolveEntryMode(undefined, true, morphStored)).toBe('typewriter');
    expect(resolveEntryMode('inherit', true, morphStored)).toBe('typewriter');
    // Non-first inheriting slide respects the user's stored choice.
    expect(resolveEntryMode(undefined, false, morphStored)).toBe('morph');
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
    // Two boundaries (1->2 and 2->3), each typing the incoming slide's chars
    // AFTER a clear+empty beat (these are transitions with outgoing text).
    expect(transitions).toHaveLength(2);
    transitions.forEach((seg, i) => {
      expect(seg.mode).toBe('typewriter');
      expect(seg.durationMs).toBe(
        typewriterEntryTotalMs(charCounts[i + 1], charMs, true),
      );
      expect(seg.durationMs).toBeGreaterThan(0);
    });
  });

  it('single slide + typewriter default + typingIntro on => a typing entry', () => {
    // The single-slide case the bug report calls out: one slide, defaults, intro
    // on. The timeline must open with a non-zero `typing` segment so Play types
    // the code in rather than showing it all at once.
    const inputs = resolveSlideInputs([{}], [120], DEFAULT_PLAYBACK_SETTINGS);
    expect(inputs[0].entryMode).toBe('typewriter');
    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    expect(timeline.segments[0].phase).toBe('typing');
    expect(timeline.segments[0].mode).toBe('typewriter');
    expect(timeline.segments[0].startMs).toBe(0);
    expect(timeline.segments[0].durationMs).toBeGreaterThan(0);
  });

  it('honours a per-slide transitionMs override on an otherwise-default deck', () => {
    // The transition picker writes ms into slides[i].transitionMs; the timeline
    // must use it as the WINDOW beat of that boundary's composite fade entry. A fade
    // now composes windowMs (the override) + the char-typing beat, so the overridden
    // slide gets a 2000ms empty-window fade THEN types its 30 chars in; the untouched
    // boundary keeps the typewriter default.
    const slides = [{}, {transitionIn: 'fade' as const, transitionMs: 2000}, {}];
    const charCounts = [180, 30, 690];
    const charMs = charMsFromCharsPerSec(
      DEFAULT_PLAYBACK_SETTINGS.typingCharsPerSec,
    );
    const inputs = resolveSlideInputs(
      slides,
      charCounts,
      DEFAULT_PLAYBACK_SETTINGS,
    );
    const timeline = buildTimeline(inputs, DEFAULT_PLAYBACK_SETTINGS);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    // Boundary into slide 1 uses the override as the window beat (2000ms) + typing
    // beat for slide 1's 30 chars; into slide 2 the default typewriter timed by the
    // incoming slide's length.
    expect(transitions[0].durationMs).toBe(
      entryTotalMs(windowSpec(2000, charCounts[1], charMs)),
    );
    expect(transitions[1].durationMs).toBe(
      typewriterEntryTotalMs(charCounts[2], charMs, true),
    );
  });
});
