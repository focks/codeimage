import {describe, expect, it} from 'vitest';
import {
  charMsToCharsPerSec,
  charsPerSecToCharMs,
  formatSecondsLabel,
  msToSeconds,
  secondsToMs,
} from './units';

describe('msToSeconds / secondsToMs', () => {
  it('converts ms to seconds with one decimal', () => {
    expect(msToSeconds(800)).toBe(0.8);
    expect(msToSeconds(2500)).toBe(2.5);
    expect(msToSeconds(1000)).toBe(1);
    expect(msToSeconds(0)).toBe(0);
  });

  it('converts seconds to ms', () => {
    expect(secondsToMs(0.8)).toBe(800);
    expect(secondsToMs(2.5)).toBe(2500);
    expect(secondsToMs(1)).toBe(1000);
  });

  it('round-trips cleanly for one-decimal seconds', () => {
    for (const ms of [100, 500, 800, 1500, 2500, 20000]) {
      expect(secondsToMs(msToSeconds(ms))).toBe(ms);
    }
  });
});

describe('formatSecondsLabel', () => {
  it('trims a trailing .0 and appends "s"', () => {
    expect(formatSecondsLabel(1000)).toBe('1s');
    expect(formatSecondsLabel(2500)).toBe('2.5s');
    expect(formatSecondsLabel(800)).toBe('0.8s');
    expect(formatSecondsLabel(20000)).toBe('20s');
  });
});

describe('charMs <-> charsPerSec', () => {
  it('converts ms-per-char to chars-per-second', () => {
    expect(charMsToCharsPerSec(40)).toBe(25);
    expect(charMsToCharsPerSec(1000 / 30)).toBe(30);
    expect(charMsToCharsPerSec(0)).toBe(0);
  });

  it('converts chars-per-second to ms-per-char', () => {
    expect(charsPerSecToCharMs(25)).toBe(40);
    expect(charsPerSecToCharMs(30)).toBe(33);
    expect(charsPerSecToCharMs(0)).toBe(0);
  });

  it('round-trips common rates', () => {
    for (const cps of [10, 20, 25, 50]) {
      expect(charMsToCharsPerSec(charsPerSecToCharMs(cps))).toBe(cps);
    }
  });
});
