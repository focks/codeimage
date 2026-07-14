import {describe, expect, it} from 'vitest';
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from './model';

describe('clampFontSize', () => {
  it('passes in-range sizes through unchanged', () => {
    expect(clampFontSize(16)).toBe(16);
    expect(clampFontSize(12)).toBe(12);
    expect(clampFontSize(24)).toBe(24);
    expect(clampFontSize(MIN_FONT_SIZE)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(MAX_FONT_SIZE)).toBe(MAX_FONT_SIZE);
  });

  it('clamps below the minimum up to MIN_FONT_SIZE', () => {
    expect(clampFontSize(MIN_FONT_SIZE - 1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(-100)).toBe(MIN_FONT_SIZE);
  });

  it('clamps above the maximum down to MAX_FONT_SIZE', () => {
    expect(clampFontSize(MAX_FONT_SIZE + 1)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(999)).toBe(MAX_FONT_SIZE);
  });

  it('rounds fractional sizes to the nearest integer', () => {
    expect(clampFontSize(16.4)).toBe(16);
    expect(clampFontSize(16.6)).toBe(17);
    expect(clampFontSize(11.9)).toBe(12);
  });

  it('defaults missing/invalid values to the 16px default', () => {
    expect(clampFontSize(undefined)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(null)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(NaN)).toBe(DEFAULT_FONT_SIZE);
  });

  it('has the expected default/bounds', () => {
    expect(DEFAULT_FONT_SIZE).toBe(16);
    expect(MIN_FONT_SIZE).toBe(10);
    expect(MAX_FONT_SIZE).toBe(28);
  });
});
