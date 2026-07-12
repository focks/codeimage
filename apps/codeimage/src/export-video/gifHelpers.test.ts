import {describe, expect, it} from 'vitest';
import {buildTimeline, stateAt, type PlaybackSettings} from '../state/playback/timeline';
import {holdReuseMap} from './videoExportMath';
import {
  gifFrameRecords,
  GIF_MAX_FPS,
  msToGifDelay,
} from './gifHelpers';

const settings: PlaybackSettings = {
  typingIntro: false,
  typingCharsPerSec: 10,
  holdMs: 1000,
  transitionMs: 500,
};

describe('gifFrameRecords', () => {
  it('produces one physical record per unique consecutive source', () => {
    // 2 slides, no typing. Timeline: hold(1000) -> transition(500) -> hold(1000).
    const timeline = buildTimeline([10, 10], settings);
    const reuseMap = holdReuseMap(timeline, GIF_MAX_FPS, stateAt);
    const records = gifFrameRecords(reuseMap, GIF_MAX_FPS);

    // Every record's sourceFrameIndex should be a self-sourced frame.
    for (const rec of records) {
      expect(reuseMap[rec.sourceFrameIndex]).toBe(rec.sourceFrameIndex);
    }
  });

  it('has fewer records than logical frames (held frames are collapsed)', () => {
    const timeline = buildTimeline([10, 10], settings);
    const reuseMap = holdReuseMap(timeline, GIF_MAX_FPS, stateAt);
    const records = gifFrameRecords(reuseMap, GIF_MAX_FPS);

    // With holds there must be runs of reused frames that collapse.
    expect(records.length).toBeLessThan(reuseMap.length);
  });

  it('total accumulated delay equals the full logical-frame duration', () => {
    const timeline = buildTimeline([10, 10], settings);
    const reuseMap = holdReuseMap(timeline, GIF_MAX_FPS, stateAt);
    const records = gifFrameRecords(reuseMap, GIF_MAX_FPS);

    const expectedTotalMs = (reuseMap.length * 1000) / GIF_MAX_FPS;
    const actualTotalMs = records.reduce((sum, r) => sum + r.delayMs, 0);
    expect(actualTotalMs).toBeCloseTo(expectedTotalMs, 3);
  });

  it('returns a single record for a timeline with only one logical frame', () => {
    // A one-logical-frame reuseMap (single hold run).
    const singleMap = [0] as const;
    const records = gifFrameRecords(singleMap, GIF_MAX_FPS);
    expect(records).toHaveLength(1);
    expect(records[0].sourceFrameIndex).toBe(0);
  });

  it('does not collapse adjacent frames with different sources', () => {
    // Manually construct a reuseMap where every frame is its own source
    // (all typing/transition frames — no holds).
    const allFresh: number[] = [0, 1, 2, 3, 4];
    const records = gifFrameRecords(allFresh, GIF_MAX_FPS);
    // Each frame should produce its own record.
    expect(records).toHaveLength(5);
    records.forEach((rec, i) => {
      expect(rec.sourceFrameIndex).toBe(i);
    });
  });

  it('accumulates delay for a long hold run', () => {
    // 10 frames, all reusing source 0 (long hold).
    const longHold: number[] = new Array(10).fill(0);
    const fps = 10;
    const records = gifFrameRecords(longHold, fps);
    // Should collapse to a single record.
    expect(records).toHaveLength(1);
    // Each logical frame is 100ms at 10fps; 10 frames = 1000ms total.
    expect(records[0].delayMs).toBeCloseTo(1000, 3);
  });
});

describe('msToGifDelay', () => {
  it('converts milliseconds to centiseconds (rounded)', () => {
    expect(msToGifDelay(100)).toBe(10);
    expect(msToGifDelay(1000)).toBe(100);
    expect(msToGifDelay(333)).toBe(33);
  });

  it('rounds to the nearest centisecond', () => {
    // 66.6ms → 6.66cs → rounds to 7.
    expect(msToGifDelay(66.6)).toBe(7);
    // 65ms → 6.5cs → rounds to 7.
    expect(msToGifDelay(65)).toBe(7);
    // 64ms → 6.4cs → rounds to 6.
    expect(msToGifDelay(64)).toBe(6);
  });

  it('clamps to a minimum of 2 centiseconds', () => {
    // Values below 20ms would be < 2cs; browsers clamp anyway.
    expect(msToGifDelay(0)).toBe(2);
    expect(msToGifDelay(10)).toBe(2); // 1cs → clamped to 2.
    expect(msToGifDelay(15)).toBe(2); // 1.5cs → rounds to 2, no clamp needed.
  });

  it('does not clamp values already above 2cs', () => {
    expect(msToGifDelay(30)).toBe(3);
    expect(msToGifDelay(500)).toBe(50);
  });
});
