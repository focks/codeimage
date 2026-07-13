import {describe, expect, it} from 'vitest';
import {resolveHeightFloor} from './verticalResizable';

/**
 * The vertical resize floor is the ONLY thing standing between a drag and a
 * shrink-below-content: it must be the larger of the absolute hard minimum (keeps
 * the header visible) and the user's own minHeight, and must NEVER be the content
 * height (that was the "height only increases" bug — content was the floor).
 */
describe('resolveHeightFloor', () => {
  const HARD_MIN = 150;

  it('uses the hard minimum when the user has no minHeight (0 = off)', () => {
    expect(resolveHeightFloor(HARD_MIN, 0)).toBe(HARD_MIN);
  });

  it('raises the floor to the user minHeight when it exceeds the hard minimum', () => {
    expect(resolveHeightFloor(HARD_MIN, 400)).toBe(400);
  });

  it('keeps the hard minimum when the user minHeight is below it', () => {
    expect(resolveHeightFloor(HARD_MIN, 80)).toBe(HARD_MIN);
  });

  it('floors a fractional user minHeight to a whole pixel', () => {
    expect(resolveHeightFloor(HARD_MIN, 320.9)).toBe(320);
  });

  it('treats a non-finite user minHeight as off (hard minimum)', () => {
    expect(resolveHeightFloor(HARD_MIN, Number.NaN)).toBe(HARD_MIN);
    expect(resolveHeightFloor(HARD_MIN, Number.POSITIVE_INFINITY)).toBe(
      HARD_MIN,
    );
  });

  it('never returns the content height — the floor is independent of content', () => {
    // Even a very tall "content" is irrelevant: only hardMin and userMinHeight
    // participate, so a drag can shrink well below the natural content height.
    const contentHeight = 2000;
    expect(resolveHeightFloor(HARD_MIN, 0)).toBeLessThan(contentHeight);
    expect(resolveHeightFloor(HARD_MIN, 200)).toBeLessThan(contentHeight);
  });
});
