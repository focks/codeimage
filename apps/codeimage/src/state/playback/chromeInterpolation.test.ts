import {describe, expect, it} from 'vitest';
import type {PersistedFrameState} from '@codeimage/store/frame/model';
import type {PersistedTerminalState} from '@codeimage/store/editor/model';
import type {Slide} from '../slides/model';
import {
  chromeEquals,
  formatColor,
  isFlatColor,
  lerp,
  lerpColor,
  parseColor,
  resolveBackgroundLayers,
  resolveChromeAtTime,
  type ResolvedChrome,
} from './chromeInterpolation';
import {buildTimeline, type PlaybackSettings, type Timeline} from './timeline';

describe('lerp', () => {
  it('interpolates endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(64, 128, 0.25)).toBe(80);
  });

  it('clamps progress outside [0,1]', () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#181818')).toEqual({r: 24, g: 24, b: 24, a: 1});
  });

  it('parses 3-digit hex', () => {
    expect(parseColor('#fff')).toEqual({r: 255, g: 255, b: 255, a: 1});
  });

  it('parses 8-digit hex with alpha', () => {
    const c = parseColor('#ff000080');
    expect(c?.r).toBe(255);
    expect(c?.a).toBeCloseTo(0.502, 2);
  });

  it('parses rgb() and rgba()', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({r: 10, g: 20, b: 30, a: 1});
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });
  });

  it('returns null for gradients, urls, named colors and null', () => {
    expect(parseColor('linear-gradient(#000, #fff)')).toBeNull();
    expect(parseColor('url(asset://x)')).toBeNull();
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe('formatColor + lerpColor', () => {
  it('round-trips an opaque color to rgb()', () => {
    expect(formatColor({r: 24, g: 24, b: 24, a: 1})).toBe('rgb(24, 24, 24)');
  });

  it('emits rgba() when alpha < 1', () => {
    expect(formatColor({r: 0, g: 0, b: 0, a: 0.5})).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('lerps two flat colors channel-wise', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('rgb(0, 0, 0)');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('rgb(255, 255, 255)');
  });

  it('returns null when either side is not a flat color', () => {
    expect(lerpColor('linear-gradient(#000,#fff)', '#fff', 0.5)).toBeNull();
    expect(lerpColor('#000', null, 0.5)).toBeNull();
  });
});

describe('isFlatColor', () => {
  it('is true for hex/rgb, false for gradients/images/null', () => {
    expect(isFlatColor('#123456')).toBe(true);
    expect(isFlatColor('rgb(1,2,3)')).toBe(true);
    expect(isFlatColor('linear-gradient(#000,#fff)')).toBe(false);
    expect(isFlatColor('url(x)')).toBe(false);
    expect(isFlatColor(null)).toBe(false);
  });
});

describe('resolveBackgroundLayers', () => {
  it('collapses flat->flat to one opaque lerp layer', () => {
    const r = resolveBackgroundLayers('#000000', '#ffffff', 0.5);
    expect(r.from).toBe('rgb(128, 128, 128)');
    expect(r.fromOpacity).toBe(1);
    expect(r.to).toBeNull();
    expect(r.toOpacity).toBe(0);
  });

  it('crossfades when either side is a gradient', () => {
    const grad = 'linear-gradient(#000, #fff)';
    const r = resolveBackgroundLayers(grad, '#ff0000', 0.25);
    expect(r.from).toBe(grad);
    expect(r.fromOpacity).toBeCloseTo(0.75, 5);
    expect(r.to).toBe('#ff0000');
    expect(r.toOpacity).toBeCloseTo(0.25, 5);
  });
});

// --- resolveChromeAtTime -------------------------------------------------

const SETTINGS: PlaybackSettings = {
  typingIntro: false,
  typingCharsPerSec: 30,
  holdMs: 1000,
  transitionMs: 1000,
  defaultTransition: 'morph',
};

function frame(over: Partial<PersistedFrameState>): PersistedFrameState {
  return {
    background: '#000000',
    padding: 64,
    radius: 8,
    visible: true,
    opacity: 100,
    minWidth: 0,
    minHeight: 0,
    autoWidth: true,
    autoHeight: true,
    width: 0,
    height: 0,
    ...over,
  };
}

function terminal(type: string): PersistedTerminalState {
  return {
    showHeader: true,
    type,
    accentVisible: true,
    shadow: null,
    background: '#111111',
    textColor: '#ffffff',
    showWatermark: false,
    showGlassReflection: false,
    opacity: 100,
    alternativeTheme: false,
    borderType: null,
  };
}

function slide(id: string, f: Partial<PersistedFrameState>, termType: string): Slide {
  return {
    id,
    frame: frame(f),
    terminal: terminal(termType),
    editor: {options: {} as never, editors: []},
  };
}

/** Two-slide deck: hold(1s) -> transition(1s) -> hold(1s). */
function twoSlideTimeline(): {timeline: Timeline; slides: Slide[]} {
  const slides = [
    slide('a', {padding: 64, radius: 8, opacity: 100, background: '#000000'}, 'macOS'),
    slide('b', {padding: 128, radius: 24, opacity: 60, background: '#ffffff'}, 'windows'),
  ];
  const timeline = buildTimeline(
    [
      {charCount: 10, entryMode: 'none'},
      {charCount: 10, entryMode: 'morph'},
    ],
    SETTINGS,
  );
  return {timeline, slides};
}

describe('resolveChromeAtTime', () => {
  it('returns the active slide chrome verbatim during a hold', () => {
    const {timeline, slides} = twoSlideTimeline();
    // t=500ms is inside slide 0's hold (0..1000ms).
    const r = resolveChromeAtTime(timeline, 500, slides);
    expect(r?.frame.padding).toBe(64);
    expect(r?.frame.radius).toBe(8);
    expect(r?.terminal.type).toBe('macOS');
  });

  it('lerps numeric frame props through the transition', () => {
    const {timeline, slides} = twoSlideTimeline();
    // Transition runs 1000..2000ms; t=1500 is progress 0.5.
    const mid = resolveChromeAtTime(timeline, 1500, slides);
    expect(mid?.frame.padding).toBe(96); // (64+128)/2
    expect(mid?.frame.radius).toBe(16); // (8+24)/2
    expect(mid?.frame.opacity).toBe(80); // (100+60)/2
  });

  it('lerps a flat->flat background to a single opaque layer', () => {
    const {timeline, slides} = twoSlideTimeline();
    const mid = resolveChromeAtTime(timeline, 1500, slides);
    expect(mid?.backgroundLayers.from).toBe('rgb(128, 128, 128)');
    expect(mid?.backgroundLayers.toOpacity).toBe(0);
    expect(mid?.frame.background).toBe('rgb(128, 128, 128)');
  });

  it('hard-swaps terminal window style at the 50% mark', () => {
    const {timeline, slides} = twoSlideTimeline();
    const before = resolveChromeAtTime(timeline, 1400, slides); // progress 0.4
    const after = resolveChromeAtTime(timeline, 1600, slides); // progress 0.6
    expect(before?.terminal.type).toBe('macOS');
    expect(after?.terminal.type).toBe('windows');
  });

  it('crossfades a flat->gradient background across the transition', () => {
    const grad = 'linear-gradient(135deg, #ab49de 0%, #4954de 100%)';
    const slides = [
      slide('a', {background: '#101010'}, 'macOS'),
      slide('b', {background: grad}, 'macOS'),
    ];
    const timeline = buildTimeline(
      [
        {charCount: 10, entryMode: 'none'},
        {charCount: 10, entryMode: 'morph'},
      ],
      SETTINGS,
    );
    // t=1250 is LINEAR progress 0.25; the crossfade uses eased progress, so
    // easeInOutCubic(0.25) = 0.0625 drives the layer opacities (front-loaded S).
    const q = resolveChromeAtTime(timeline, 1250, slides); // linear progress 0.25
    expect(q?.backgroundLayers.from).toBe('#101010');
    expect(q?.backgroundLayers.fromOpacity).toBeCloseTo(0.9375, 5);
    expect(q?.backgroundLayers.to).toBe(grad);
    expect(q?.backgroundLayers.toOpacity).toBeCloseTo(0.0625, 5);
  });

  it('is seek-exact: same time yields identical chrome', () => {
    const {timeline, slides} = twoSlideTimeline();
    expect(resolveChromeAtTime(timeline, 1333, slides)).toEqual(
      resolveChromeAtTime(timeline, 1333, slides),
    );
  });

  it('eases padding: non-linear deltas at equal 25/50/75% time steps', () => {
    const {timeline, slides} = twoSlideTimeline();
    // Transition runs 1000..2000ms; padding lerps 64 -> 128 (span 64), eased.
    const p25 = resolveChromeAtTime(timeline, 1250, slides)!.frame.padding;
    const p50 = resolveChromeAtTime(timeline, 1500, slides)!.frame.padding;
    const p75 = resolveChromeAtTime(timeline, 1750, slides)!.frame.padding;
    // easeInOutCubic: 0.0625 / 0.5 / 0.9375 of the span above the start (64).
    expect(p25).toBeCloseTo(64 + 64 * 0.0625, 5); // 68
    expect(p50).toBeCloseTo(64 + 64 * 0.5, 5); // 96
    expect(p75).toBeCloseTo(64 + 64 * 0.9375, 5); // 124
    // Deltas across equal time steps are NOT constant (that would be linear):
    // the middle step advances far more than the outer steps (accel/decel).
    const d1 = p50 - p25;
    const d2 = p75 - p50;
    const d0 = p25 - (64 + 64 * 0); // first quarter delta from t=1000
    expect(d1).toBeGreaterThan(d0);
    expect(d1).toBeGreaterThan(p75 - (64 + 64)); // vs last quarter to end
    expect(d1).toBeCloseTo(d2, 5); // symmetric about the midpoint
  });

  it('returns null for an empty deck', () => {
    const {timeline} = twoSlideTimeline();
    expect(resolveChromeAtTime(timeline, 0, [])).toBeNull();
  });
});

describe('chromeEquals', () => {
  const chrome = (over?: {
    frame?: Partial<PersistedFrameState>;
    terminalType?: string;
    layers?: Partial<ResolvedChrome['backgroundLayers']>;
  }): ResolvedChrome => ({
    frame: frame(over?.frame ?? {}),
    terminal: terminal(over?.terminalType ?? 'macOS'),
    backgroundLayers: {
      from: '#000000',
      fromOpacity: 1,
      to: null,
      toOpacity: 0,
      ...over?.layers,
    },
  });

  it('true for two value-identical chromes (hold reuse)', () => {
    expect(chromeEquals(chrome(), chrome())).toBe(true);
  });

  it('true for the same reference', () => {
    const c = chrome();
    expect(chromeEquals(c, c)).toBe(true);
  });

  it('false when a frame numeric prop differs (transition tween)', () => {
    expect(chromeEquals(chrome(), chrome({frame: {padding: 65}}))).toBe(false);
    expect(chromeEquals(chrome(), chrome({frame: {radius: 9}}))).toBe(false);
    expect(chromeEquals(chrome(), chrome({frame: {opacity: 99}}))).toBe(false);
  });

  it('false when the background value differs', () => {
    expect(
      chromeEquals(chrome(), chrome({frame: {background: '#010101'}})),
    ).toBe(false);
  });

  it('false when a boolean/size frame prop swaps at the midpoint', () => {
    expect(chromeEquals(chrome(), chrome({frame: {visible: false}}))).toBe(
      false,
    );
    expect(chromeEquals(chrome(), chrome({frame: {autoHeight: false}}))).toBe(
      false,
    );
    expect(chromeEquals(chrome(), chrome({frame: {height: 420}}))).toBe(false);
  });

  it('false when the terminal window style hard-swaps', () => {
    expect(chromeEquals(chrome(), chrome({terminalType: 'windows'}))).toBe(
      false,
    );
  });

  it('false when a crossfade layer opacity moves per frame', () => {
    expect(
      chromeEquals(chrome(), chrome({layers: {fromOpacity: 0.5}})),
    ).toBe(false);
    expect(chromeEquals(chrome(), chrome({layers: {to: '#fff', toOpacity: 0.5}}))).toBe(
      false,
    );
  });

  it('false when only one side is null', () => {
    expect(chromeEquals(chrome(), null)).toBe(false);
    expect(chromeEquals(null, chrome())).toBe(false);
    expect(chromeEquals(null, null)).toBe(true);
  });
});
