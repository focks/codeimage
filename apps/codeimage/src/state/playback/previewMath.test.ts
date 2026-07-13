import {describe, expect, it} from 'vitest';
import {
  boundaryPreviewWindow,
  PREVIEW_PAD_MS,
  slideEntryStartMs,
} from './previewMath';
import {buildTimeline, type PlaybackSettings} from './timeline';

const settings: PlaybackSettings = {
  typingIntro: true,
  typingCharsPerSec: 10, // 100ms/char
  holdMs: 1000,
  transitionMs: 500,
  defaultTransition: 'morph',
};
const noTyping: PlaybackSettings = {...settings, typingIntro: false};

// 3 slides, no typing intro:
//   hold0[0,1000) transition0->1[1000,1500) hold1[1500,2500)
//   transition1->2[2500,3000) hold2[3000,4000)
const threeSlide = buildTimeline([10, 10, 10], noTyping);

describe('slideEntryStartMs', () => {
  it('slide 0 (and below) starts at 0', () => {
    expect(slideEntryStartMs(threeSlide, 0)).toBe(0);
    expect(slideEntryStartMs(threeSlide, -1)).toBe(0);
  });

  it('later slides start at their entry (transition) segment', () => {
    // Present-from-slide-1 => start of transition 0->1.
    expect(slideEntryStartMs(threeSlide, 1)).toBe(1000);
    // Present-from-slide-2 => start of transition 1->2.
    expect(slideEntryStartMs(threeSlide, 2)).toBe(2500);
  });

  it('falls back to the hold start when a slide cuts hard (no transition)', () => {
    // slide 1 enters with `none` => no transition segment; start at its hold.
    const cut = buildTimeline(
      [
        {charCount: 10, entryMode: 'none'},
        {charCount: 10, entryMode: 'none'},
      ],
      noTyping,
    );
    // hold0[0,1000) hold1[1000,2000)
    expect(slideEntryStartMs(cut, 1)).toBe(1000);
  });
});

describe('boundaryPreviewWindow', () => {
  it('slide 0 intro window wraps the typing segment (padded, clamped at 0)', () => {
    // With typingIntro on: typing[0,1000) then holds/transitions after.
    const withIntro = buildTimeline([10, 10], settings);
    const w = boundaryPreviewWindow(withIntro, 0);
    expect(w).not.toBeNull();
    expect(w!.startMs).toBe(0); // 0 - 150 clamped to 0
    expect(w!.endMs).toBe(1000 + PREVIEW_PAD_MS); // typing ends at 1000
  });

  it('a mid-deck boundary window wraps its transition, padded both sides', () => {
    // transition 0->1 is [1000,1500).
    const w = boundaryPreviewWindow(threeSlide, 1);
    expect(w).toEqual({
      startMs: 1000 - PREVIEW_PAD_MS,
      endMs: 1500 + PREVIEW_PAD_MS,
    });
  });

  it('clamps the end to the timeline total', () => {
    // Last transition 1->2 ends at 3000; total is 4000, so +150 fits (no clamp).
    const w = boundaryPreviewWindow(threeSlide, 2);
    expect(w!.endMs).toBe(3000 + PREVIEW_PAD_MS);
  });

  it('returns null when the boundary has no animated entry (none cut)', () => {
    const cut = buildTimeline(
      [
        {charCount: 10, entryMode: 'none'},
        {charCount: 10, entryMode: 'none'},
      ],
      noTyping,
    );
    // No typing (slide 0 none) => boundary 0 has nothing to preview.
    expect(boundaryPreviewWindow(cut, 0)).toBeNull();
    // slide 1 cuts hard => no transition segment => null.
    expect(boundaryPreviewWindow(cut, 1)).toBeNull();
  });

  it('returns null for an out-of-range boundary', () => {
    expect(boundaryPreviewWindow(threeSlide, 9)).toBeNull();
  });
});
