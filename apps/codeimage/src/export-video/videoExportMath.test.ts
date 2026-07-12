import {describe, expect, it} from 'vitest';
import {buildTimeline, stateAt, type PlaybackSettings} from '../state/playback/timeline';
import {
  captureSizeFor,
  frameCount,
  frameDurationMicros,
  frameTimeMs,
  frameTimestampMicros,
  holdReuseMap,
  roundToEven,
  targetBitrate,
} from './videoExportMath';

describe('roundToEven', () => {
  it('rounds down to the nearest even number', () => {
    expect(roundToEven(100)).toBe(100);
    expect(roundToEven(101)).toBe(100);
    expect(roundToEven(103)).toBe(102);
    expect(roundToEven(2.9)).toBe(2);
  });

  it('never returns below 2', () => {
    expect(roundToEven(0)).toBe(2);
    expect(roundToEven(1)).toBe(2);
    expect(roundToEven(-5)).toBe(2);
  });
});

describe('captureSizeFor', () => {
  it('applies pixelRatio then rounds each dimension to even', () => {
    expect(captureSizeFor(400, 300, 1)).toEqual({width: 400, height: 300});
    expect(captureSizeFor(400, 300, 2)).toEqual({width: 800, height: 600});
  });

  it('rounds odd scaled dimensions down to even', () => {
    // 401 * 1 = 401 -> 400 ; 301 -> 300
    expect(captureSizeFor(401, 301, 1)).toEqual({width: 400, height: 300});
    // 333.5 * 1 = 333 -> 332
    expect(captureSizeFor(333.5, 333.5, 1)).toEqual({width: 332, height: 332});
  });
});

describe('frameCount', () => {
  it('is floor(seconds * fps) + 1 (end frame inclusive)', () => {
    expect(frameCount(1000, 30)).toBe(31);
    expect(frameCount(2000, 30)).toBe(61);
    expect(frameCount(100, 30)).toBe(4); // floor(3) + 1
  });

  it('yields one frame for a zero/empty timeline', () => {
    expect(frameCount(0, 30)).toBe(1);
    expect(frameCount(-100, 30)).toBe(1);
  });
});

describe('frameTimeMs / frameTimestampMicros / frameDurationMicros', () => {
  it('maps frame index to injected ms', () => {
    expect(frameTimeMs(0, 30)).toBe(0);
    expect(frameTimeMs(30, 30)).toBe(1000);
    expect(frameTimeMs(15, 30)).toBe(500);
  });

  it('maps frame index to presentation timestamp in microseconds', () => {
    expect(frameTimestampMicros(0, 30)).toBe(0);
    expect(frameTimestampMicros(30, 30)).toBe(1_000_000);
    expect(frameTimestampMicros(1, 30)).toBe(33_333);
  });

  it('computes per-frame duration in microseconds', () => {
    expect(frameDurationMicros(30)).toBe(33_333);
    expect(frameDurationMicros(60)).toBe(16_667);
  });
});

describe('targetBitrate', () => {
  it('scales with resolution and fps at ~0.1 bpp', () => {
    expect(targetBitrate(1920, 1080, 30)).toBe(
      Math.round(1920 * 1080 * 30 * 0.1),
    );
    // Bigger resolution => bigger bitrate.
    expect(targetBitrate(3840, 2160, 30)).toBeGreaterThan(
      targetBitrate(1920, 1080, 30),
    );
  });
});

describe('holdReuseMap', () => {
  const settings: PlaybackSettings = {
    typingIntro: false,
    typingCharsPerSec: 10,
    holdMs: 1000,
    transitionMs: 500,
  };

  it('reuses the first frame of a contiguous hold run', () => {
    // 2 slides: hold(1000) -> transition(500) -> hold(1000). No typing.
    const timeline = buildTimeline([10, 10], settings);
    const map = holdReuseMap(timeline, 30, stateAt);

    // Frame 0 is the start of the first hold => fresh.
    expect(map[0]).toBe(0);
    // Later frames in the same hold run reuse frame 0.
    expect(map[5]).toBe(0);

    // Find the first transition frame — it must be a fresh capture.
    const firstTransition = map.findIndex((src, i) => {
      const {phase} = stateAt(timeline, frameTimeMs(i, 30));
      return phase === 'transition' && src === i;
    });
    expect(firstTransition).toBeGreaterThan(0);

    // Every transition frame is captured fresh (src === i).
    map.forEach((src, i) => {
      const {phase} = stateAt(timeline, frameTimeMs(i, 30));
      if (phase === 'transition') expect(src).toBe(i);
    });
  });

  it('starts a new hold run when the slide changes', () => {
    const timeline = buildTimeline([10, 10], settings);
    const map = holdReuseMap(timeline, 30, stateAt);

    // Collect the fresh-capture indices for hold frames grouped by slide.
    const freshHoldBySlide = new Map<number, number[]>();
    map.forEach((src, i) => {
      const {phase, slideIndex} = stateAt(timeline, frameTimeMs(i, 30));
      if (phase === 'hold' && src === i) {
        const arr = freshHoldBySlide.get(slideIndex) ?? [];
        arr.push(i);
        freshHoldBySlide.set(slideIndex, arr);
      }
    });

    // Each slide's hold run has exactly one fresh-capture frame.
    expect(freshHoldBySlide.get(0)).toHaveLength(1);
    expect(freshHoldBySlide.get(1)).toHaveLength(1);
  });

  it('every reuse source points at a fresh (self-sourced) frame', () => {
    const timeline = buildTimeline([10, 10], settings);
    const map = holdReuseMap(timeline, 30, stateAt);
    map.forEach(src => {
      expect(map[src]).toBe(src);
    });
  });

  it('captures typing frames fresh', () => {
    const withTyping: PlaybackSettings = {...settings, typingIntro: true};
    const timeline = buildTimeline([30, 10], withTyping);
    const map = holdReuseMap(timeline, 30, stateAt);
    map.forEach((src, i) => {
      const {phase} = stateAt(timeline, frameTimeMs(i, 30));
      if (phase === 'typing') expect(src).toBe(i);
    });
  });
});
