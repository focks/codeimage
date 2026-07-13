import {describe, expect, it} from 'vitest';
import {
  buildTimeline,
  charMsFromCharsPerSec,
  stateAt,
  typedCharCount,
  typewriterDurationMs,
  typingDurationMs,
  type PlaybackSettings,
  type SlideTimelineInput,
} from './timeline';

const settings: PlaybackSettings = {
  typingIntro: true,
  typingCharsPerSec: 10, // 10 chars/sec => 100ms per char
  holdMs: 1000,
  transitionMs: 500,
  defaultTransition: 'morph',
};

const noTyping: PlaybackSettings = {...settings, typingIntro: false};

describe('typingDurationMs', () => {
  it('is charCount / rate * 1000', () => {
    expect(typingDurationMs(30, 10)).toBe(3000);
    expect(typingDurationMs(5, 10)).toBe(500);
  });

  it('collapses to 0 for empty code or non-positive rate', () => {
    expect(typingDurationMs(0, 10)).toBe(0);
    expect(typingDurationMs(30, 0)).toBe(0);
    expect(typingDurationMs(-5, 10)).toBe(0);
  });
});

describe('buildTimeline', () => {
  it('builds typing -> hold -> transition -> hold for 2 slides', () => {
    // slide0 code length 20 => typing 2000ms
    const timeline = buildTimeline([20, 10], settings);
    expect(timeline.segments.map(s => s.phase)).toEqual([
      'typing',
      'hold',
      'transition',
      'hold',
    ]);
    // 2000 typing + 1000 hold + 500 transition + 1000 hold
    expect(timeline.totalDurationMs).toBe(4500);
    expect(timeline.segments[0]).toMatchObject({
      startMs: 0,
      durationMs: 2000,
      slideIndex: 0,
    });
    expect(timeline.segments[1]).toMatchObject({startMs: 2000, durationMs: 1000});
    expect(timeline.segments[2]).toMatchObject({
      startMs: 3000,
      durationMs: 500,
      phase: 'transition',
      slideIndex: 0,
    });
    expect(timeline.segments[3]).toMatchObject({
      startMs: 3500,
      durationMs: 1000,
      slideIndex: 1,
    });
  });

  it('omits the typing segment when typingIntro is false', () => {
    const timeline = buildTimeline([20, 10], noTyping);
    expect(timeline.segments.map(s => s.phase)).toEqual([
      'hold',
      'transition',
      'hold',
    ]);
    expect(timeline.totalDurationMs).toBe(2500);
  });

  it('single slide => a single hold (+ typing if enabled), no transition', () => {
    const one = buildTimeline([20], settings);
    expect(one.segments.map(s => s.phase)).toEqual(['typing', 'hold']);
    expect(one.totalDurationMs).toBe(3000);

    const oneNoType = buildTimeline([20], noTyping);
    expect(oneNoType.segments.map(s => s.phase)).toEqual(['hold']);
    expect(oneNoType.totalDurationMs).toBe(1000);
  });

  it('empty slides => empty timeline of 0 duration', () => {
    const timeline = buildTimeline([], settings);
    expect(timeline.segments).toHaveLength(0);
    expect(timeline.totalDurationMs).toBe(0);
  });

  it('skips a zero-length typing intro (empty first slide)', () => {
    const timeline = buildTimeline([0, 10], settings);
    expect(timeline.segments.map(s => s.phase)).toEqual([
      'hold',
      'transition',
      'hold',
    ]);
  });

  it('per-slide transitionMs overrides the global entry duration', () => {
    // slide 1 (fade) overrides transitionMs=1200; slide 2 (morph) inherits 500.
    const inputs: SlideTimelineInput[] = [
      {charCount: 10, entryMode: 'none'},
      {charCount: 10, entryMode: 'fade', transitionMs: 1200},
      {charCount: 10, entryMode: 'morph'},
    ];
    const timeline = buildTimeline(inputs, noTyping);
    const transitions = timeline.segments.filter(s => s.phase === 'transition');
    expect(transitions[0].durationMs).toBe(1200); // per-slide override
    expect(transitions[1].durationMs).toBe(500); // inherited global
  });

  it('per-slide transitionMs is ignored for typewriter/none entries', () => {
    // A typewriter entry stays charCount-driven even with transitionMs set.
    const inputs: SlideTimelineInput[] = [
      {charCount: 30, entryMode: 'typewriter', transitionMs: 9999},
    ];
    const timeline = buildTimeline(inputs, settings);
    // 30 chars at 100ms/char (10 cps) => 3000ms, not 9999.
    expect(timeline.segments[0]).toMatchObject({phase: 'typing', durationMs: 3000});
  });
});

describe('stateAt', () => {
  const timeline = buildTimeline([20, 10], settings);
  // segments: typing[0,2000) hold[2000,3000) transition[3000,3500) hold[3500,4500)

  it('t=0 => typing, progress 0', () => {
    expect(stateAt(timeline, 0)).toMatchObject({
      slideIndex: 0,
      phase: 'typing',
      progress: 0,
    });
  });

  it('clamps negative time to the start', () => {
    expect(stateAt(timeline, -100)).toMatchObject({
      phase: 'typing',
      progress: 0,
    });
  });

  it('mid-typing progress', () => {
    expect(stateAt(timeline, 1000)).toMatchObject({
      slideIndex: 0,
      phase: 'typing',
      progress: 0.5,
    });
  });

  it('phase boundary belongs to the later segment (progress 0)', () => {
    // t=2000 is the start of hold, not the end of typing
    expect(stateAt(timeline, 2000)).toMatchObject({
      phase: 'hold',
      progress: 0,
      slideIndex: 0,
    });
  });

  it('mid-hold', () => {
    expect(stateAt(timeline, 2500)).toMatchObject({
      phase: 'hold',
      progress: 0.5,
    });
  });

  it('transition boundary + midpoint carry the leaving slide index', () => {
    expect(stateAt(timeline, 3000)).toMatchObject({
      phase: 'transition',
      progress: 0,
      slideIndex: 0,
    });
    expect(stateAt(timeline, 3250)).toMatchObject({
      phase: 'transition',
      progress: 0.5,
      slideIndex: 0,
    });
  });

  it('second slide hold', () => {
    expect(stateAt(timeline, 4000)).toMatchObject({
      phase: 'hold',
      progress: 0.5,
      slideIndex: 1,
    });
  });

  it('t=end clamps to last segment fully complete', () => {
    expect(stateAt(timeline, 4500)).toMatchObject({
      phase: 'hold',
      progress: 1,
      slideIndex: 1,
    });
  });

  it('t beyond end clamps to last segment', () => {
    expect(stateAt(timeline, 99999)).toMatchObject({
      phase: 'hold',
      progress: 1,
      slideIndex: 1,
    });
  });

  it('is deterministic: same input => same output', () => {
    for (const t of [0, 500, 2000, 3000, 3250, 4500]) {
      expect(stateAt(timeline, t)).toEqual(stateAt(timeline, t));
    }
  });

  it('empty timeline yields a single static frame', () => {
    const empty = buildTimeline([], settings);
    expect(stateAt(empty, 0)).toMatchObject({
      slideIndex: 0,
      phase: 'hold',
      progress: 0,
      totalDurationMs: 0,
    });
    // Nothing to animate: the static frame is time-invariant.
    expect(stateAt(empty, 1000)).toMatchObject({phase: 'hold', progress: 0});
  });
});

describe('typewriterDurationMs', () => {
  it('is charCount * charMs', () => {
    expect(typewriterDurationMs(20, 50)).toBe(1000);
    expect(typewriterDurationMs(3, 100)).toBe(300);
  });
  it('collapses to 0 for empty code or non-positive per-char time', () => {
    expect(typewriterDurationMs(0, 50)).toBe(0);
    expect(typewriterDurationMs(20, 0)).toBe(0);
    expect(typewriterDurationMs(-1, 50)).toBe(0);
  });
});

describe('charMsFromCharsPerSec', () => {
  it('inverts a chars-per-second rate into ms-per-char', () => {
    expect(charMsFromCharsPerSec(10)).toBe(100);
    expect(charMsFromCharsPerSec(50)).toBe(20);
  });
  it('is 0 for a non-positive rate', () => {
    expect(charMsFromCharsPerSec(0)).toBe(0);
    expect(charMsFromCharsPerSec(-5)).toBe(0);
  });
});

describe('buildTimeline (per-slide inputs)', () => {
  const input = (
    charCount: number,
    entryMode: SlideTimelineInput['entryMode'],
    extra: Partial<SlideTimelineInput> = {},
  ): SlideTimelineInput => ({charCount, entryMode, ...extra});

  it('slide 0 typewriter entry sizes by its own char count and per-char timing', () => {
    // 10 chars/sec => 100ms/char; 8 chars => 800ms typewriter intro.
    const timeline = buildTimeline(
      [input(8, 'typewriter'), input(4, 'morph')],
      settings,
    );
    expect(timeline.segments.map(s => [s.phase, s.mode, s.durationMs])).toEqual([
      ['typing', 'typewriter', 800],
      ['hold', 'none', 1000],
      ['transition', 'morph', 500],
      ['hold', 'none', 1000],
    ]);
  });

  it('per-slide typewriterCharMs overrides the derived global timing', () => {
    const timeline = buildTimeline(
      [input(8, 'typewriter', {typewriterCharMs: 25})],
      settings,
    );
    // 8 chars * 25ms = 200ms, ignoring the 100ms/char global rate.
    expect(timeline.segments[0]).toMatchObject({
      phase: 'typing',
      durationMs: 200,
    });
  });

  it("slide 0 'none' entry contributes no typing segment (hard cut)", () => {
    const timeline = buildTimeline(
      [input(8, 'none'), input(4, 'fade')],
      settings,
    );
    expect(timeline.segments.map(s => [s.phase, s.mode])).toEqual([
      ['hold', 'none'],
      ['transition', 'fade'],
      ['hold', 'none'],
    ]);
  });

  it('mixed entry modes each carry their mode + leaving index', () => {
    const timeline = buildTimeline(
      [
        input(10, 'typewriter'), // slide 0 typing 1000ms
        input(6, 'fade'), // transition into slide 1
        input(6, 'slide'), // transition into slide 2
      ],
      settings,
    );
    expect(
      timeline.segments.map(s => [s.phase, s.mode, s.slideIndex]),
    ).toEqual([
      ['typing', 'typewriter', 0],
      ['hold', 'none', 0],
      ['transition', 'fade', 0], // leaving slide 0 -> entering slide 1
      ['hold', 'none', 1],
      ['transition', 'slide', 1], // leaving slide 1 -> entering slide 2
      ['hold', 'none', 2],
    ]);
  });

  it("a 'none' transition between slides drops the transition segment", () => {
    const timeline = buildTimeline(
      [input(0, 'none'), input(6, 'none'), input(6, 'morph')],
      settings,
    );
    // slide0 none-entry (no typing), holds; slide1 none-transition (cut), holds;
    // slide2 morph transition, holds.
    expect(timeline.segments.map(s => [s.phase, s.mode])).toEqual([
      ['hold', 'none'], // slide 0 hold
      ['hold', 'none'], // slide 1 hold (no transition in)
      ['transition', 'morph'], // into slide 2
      ['hold', 'none'], // slide 2 hold
    ]);
  });

  it('per-slide holdMs override wins over the global hold', () => {
    const timeline = buildTimeline(
      [input(0, 'none', {holdMs: 250}), input(4, 'morph', {holdMs: 3000})],
      settings,
    );
    const holds = timeline.segments.filter(s => s.phase === 'hold');
    expect(holds.map(s => s.durationMs)).toEqual([250, 3000]);
  });

  it('stateAt reports the segment mode for a transition frame', () => {
    const timeline = buildTimeline(
      [input(10, 'typewriter'), input(6, 'fade')],
      settings,
    );
    // typing[0,1000) hold[1000,2000) transition[2000,2500) hold[2500,3500)
    expect(stateAt(timeline, 2250)).toMatchObject({
      phase: 'transition',
      mode: 'fade',
      slideIndex: 0,
    });
    expect(stateAt(timeline, 500)).toMatchObject({
      phase: 'typing',
      mode: 'typewriter',
    });
    expect(stateAt(timeline, 1500)).toMatchObject({phase: 'hold', mode: 'none'});
  });
});

describe('typedCharCount', () => {
  it('reveals floor(progress * total) chars', () => {
    expect(typedCharCount(10, 0)).toBe(0);
    expect(typedCharCount(10, 0.5)).toBe(5);
    expect(typedCharCount(10, 0.99)).toBe(9);
    expect(typedCharCount(10, 1)).toBe(10);
  });

  it('clamps out-of-range progress', () => {
    expect(typedCharCount(10, -1)).toBe(0);
    expect(typedCharCount(10, 2)).toBe(10);
  });

  it('is 0 for empty code', () => {
    expect(typedCharCount(0, 0.5)).toBe(0);
  });

  it('is a pure function of progress (monotonic, seekable)', () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const n = typedCharCount(37, p);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    // Jumping directly to any progress gives the same result as stepping to it.
    expect(typedCharCount(37, 0.6)).toBe(typedCharCount(37, 0.6));
  });
});
