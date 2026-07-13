import {describe, expect, it} from 'vitest';
import {
  boundaryPreviewWindow,
  PREVIEW_PAD_MS,
  slideEntryStartMs,
} from './previewMath';
import {buildTimeline, stateAt, type PlaybackSettings} from './timeline';

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

  // ── Present-from-here must land ON the entry segment, never mid-hold ──────
  // Regression guard for the "play presents from the active slide" behaviour: the
  // start time must sit at the entering slide's ENTRY (typing/transition) so its
  // animation plays, NOT in its hold (which would show the finished code at once).

  it('single-slide deck: present-from-slide-0 starts at the typing entry (t=0)', () => {
    // With typingIntro on, slide 0's ONLY entry is a typewriter starting at 0.
    // If this ever returned the hold start instead, the typing would be skipped.
    const one = buildTimeline([10], settings); // typing[0,1000) hold[1000,2000)
    const start = slideEntryStartMs(one, 0);
    expect(start).toBe(0);
    // The frame at that start time is the typing entry at progress 0 — i.e. the
    // animation is about to play, not a static hold showing the whole slide.
    const frame = stateAt(one, start);
    expect(frame.phase).toBe('typing');
    expect(frame.mode).toBe('typewriter');
    expect(frame.progress).toBe(0);
  });

  it('present-from-here lands on the entering slide entry for every slide', () => {
    // typing0[0,1000) transition0->1[1000,1500) hold1[1500,2500)
    //   transition1->2[2500,3000) hold2[3000,4000)
    const three = buildTimeline([10, 10, 10], settings);
    // Slide 0 => its typing entry.
    expect(stateAt(three, slideEntryStartMs(three, 0)).phase).toBe('typing');
    // Slides 1 and 2 => their transition (entry) segment, at progress 0.
    for (const i of [1, 2]) {
      const frame = stateAt(three, slideEntryStartMs(three, i));
      expect(frame.phase).toBe('transition');
      expect(frame.progress).toBe(0);
      // The transition carries the LEAVING index (i-1), the entry into slide i.
      expect(frame.slideIndex).toBe(i - 1);
    }
  });

  it('a mid-deck typewriter entry still starts at its entry, not its hold', () => {
    // Slide 1 explicitly types in (an i>0 typewriter entry is tagged `transition`).
    // Each typewriter entry now carries beats: slide 0 = 1000 type + 300 empty =
    // 1300ms; slide 1 = 150 clear + 300 empty + 1000 type = 1450ms.
    // typing0[0,1300) hold0[1300,2300) transition0->1[2300,3750) hold1[3750,4750)
    const typed = buildTimeline(
      [
        {charCount: 10, entryMode: 'typewriter'},
        {charCount: 10, entryMode: 'typewriter'},
      ],
      settings,
    );
    const start = slideEntryStartMs(typed, 1);
    // The transition (entry into slide 1) begins after slide 0's typing + hold.
    expect(start).toBe(2300);
    const frame = stateAt(typed, start);
    expect(frame.phase).toBe('transition');
    expect(frame.mode).toBe('typewriter'); // the entry animation, not the hold
    expect(frame.progress).toBe(0);
  });
});

describe('boundaryPreviewWindow', () => {
  it('slide 0 intro window wraps the typing segment (padded, clamped at 0)', () => {
    // With typingIntro on: slide 0 typewriter = 1000 type + 300 empty beat = 1300ms,
    // so typing[0,1300) then holds/transitions after.
    const withIntro = buildTimeline([10, 10], settings);
    const w = boundaryPreviewWindow(withIntro, 0);
    expect(w).not.toBeNull();
    expect(w!.startMs).toBe(0); // 0 - 150 clamped to 0
    expect(w!.endMs).toBe(1300 + PREVIEW_PAD_MS); // typing ends at 1300
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
