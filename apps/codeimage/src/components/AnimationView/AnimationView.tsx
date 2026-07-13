import {getRootEditorStore} from '@codeimage/store/editor';
import {activeEditorOf} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {buildTimelineFromSlides} from '@codeimage/store/playback/playbackController';
import {easeInOutCubic} from '@codeimage/store/playback/easing';
import {stateAt, type EntryMode} from '@codeimage/store/playback/timeline';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import {syncTokenKeys, type KeyedTokensInfo} from 'shiki-magic-move/core';
import {
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import {activeCustomTheme} from './activeTheme';
import * as styles from './AnimationView.css';
import {resolveSurfaceBox, type BoxSize} from './boxSizing';
import {EDITOR_METRICS, surfacePadding} from './editorMetrics';
import {
  ensureHighlighter,
  keyedTokensFor,
  shikiThemeFor,
  shikiThemeNameFor,
} from './shikiHighlighter';
import {
  caretOpacity,
  fadeLayers,
  fullTokens,
  morphLayers,
  revealTypedTokens,
  slideLines,
  type RenderLine,
  type RenderToken,
} from './tokenReveal';

/**
 * Animated code surface shown during playback in place of CodeMirror. Reads the
 * injected `playback.currentTimeMs` and renders a pure function of it: a per-slide
 * entry animation (typewriter / fade / slide / morph / hard cut) followed by a
 * static hold. The entry mode comes from the timeline segment (`frame.mode`), so
 * per-slide settings drive both preview and export through the same path.
 *
 * Seeking (phase 3): everything below derives from `stateAt(timeline, tMs)` and
 * the pure token helpers — no wall-clock reads, no DOM measurement, no reliance
 * on CSS-transition timing. Setting `currentTimeMs` to any value reproduces the
 * exact same DOM, which is what deterministic export needs.
 */

/** An empty keyed token set, used as the `from` layer for slide 0's entry. */
function emptyTokens(reference: KeyedTokensInfo): KeyedTokensInfo {
  return {
    ...reference,
    code: '',
    hash: 'empty',
    tokens: [],
    lineNumbers: false,
  };
}

export function AnimationView() {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const editor = getRootEditorStore();

  // The active codeimage theme drives a runtime-built shiki theme so playback
  // colors match the editor (problem P2). Tracked reactively so switching themes
  // regenerates the highlight.
  const customTheme = createMemo(() => activeCustomTheme());

  const fontFamily = createMemo(() => {
    const font = editor.computed.selectedFont();
    return `${font?.name ?? 'monospace'}, monospace`;
  });
  const fontWeight = createMemo(() => editor.state.options.fontWeight ?? 400);

  // Build keyed tokens for every slide once (recomputed if slides/theme change).
  const [tokenSets] = createResource(
    () => ({
      slides: slidesStore.state.slides,
      theme: customTheme(),
    }),
    async ({slides, theme}): Promise<KeyedTokensInfo[]> => {
      if (!theme) return [];
      const shikiTheme = shikiThemeFor(theme);
      const themeName = shikiThemeNameFor(theme);
      const langs = slides.map(s => activeEditorOf(s).languageId);
      const highlighter = await ensureHighlighter(langs, [shikiTheme]);
      return slides.map((slide: Slide) => {
        const {code, languageId} = activeEditorOf(slide);
        return keyedTokensFor(highlighter, code, languageId, themeName);
      });
    },
  );

  // Sync keys across adjacent pairs so matched tokens share keys for the morph.
  const syncedSets = createMemo<KeyedTokensInfo[] | undefined>(() => {
    const sets = tokenSets();
    if (!sets || sets.length === 0) return sets;
    const out = [...sets];
    for (let i = 0; i < out.length - 1; i++) {
      const {from, to} = syncTokenKeys(out[i], out[i + 1]);
      out[i] = from;
      out[i + 1] = to;
    }
    return out;
  });

  const frame = createMemo(() => {
    const timeline = buildTimelineFromSlides();
    return stateAt(timeline, playback.currentTimeMs);
  });

  // Ghost-measured full-content box of every slide. Recomputed only when a slide's
  // rendered layout changes (code/theme/font), NOT per animation frame — so a
  // transition can lerp between two STABLE sizes purely from progress. Measuring
  // the full final code (not the revealed prefix) is what keeps the window from
  // growing while the typewriter reveals text (problem A).
  const [slideBoxes, setSlideBoxes] = createSignal<(BoxSize | undefined)[]>([]);

  const setBoxAt = (index: number, box: BoxSize) => {
    setSlideBoxes(prev => {
      const cur = prev[index];
      // Skip sub-pixel jitter to avoid a feedback loop with the resize observer.
      if (cur && Math.abs(cur.width - box.width) < 0.5 && Math.abs(cur.height - box.height) < 0.5) {
        return prev;
      }
      const next = [...prev];
      next[index] = box;
      return next;
    });
  };

  // The explicit surface box for the current frame: the active slide's full box on
  // a hold/typing frame (constant -> no growth, problem A), or the eased
  // interpolation from slide i to slide i+1 during a transition (smooth size morph,
  // problem B).
  //
  // The user's min-width/height floor is intentionally NOT applied here: the shared
  // Frame `.container` already floors the WINDOW via `max(width, floor)` on the
  // playback path exactly as it does for the live editor, and the container hugs
  // this surface via `min-width: max-content`. Flooring the surface too would stack
  // the floor + chrome and overshoot the requested minimum, so the container is left
  // as the single source of truth for the floor (editor-identical semantics).
  const surfaceBox = createMemo<BoxSize | undefined>(() => {
    const f = frame();
    return resolveSurfaceBox({
      boxes: slideBoxes(),
      slideIndex: f.slideIndex,
      isTransition: f.phase === 'transition',
      easedProgress: easeInOutCubic(f.progress),
    });
  });

  const textStyle = createMemo(() => ({
    'font-family': fontFamily(),
    'font-weight': String(fontWeight()),
    // Mirror the live editor's exact box so the CanvasEditor -> AnimationView swap
    // on Play does not shift the code block (problem P1). Values are the rendered
    // `.cm-content` / `.cm-line` metrics (see editorMetrics.ts).
    'font-size': `${EDITOR_METRICS.fontSizePx}px`,
    'line-height': String(EDITOR_METRICS.lineHeight),
    'tab-size': String(EDITOR_METRICS.tabSize),
    padding: surfacePadding(),
  }));

  return (
    <div
      class={styles.surface}
      style={{
        ...textStyle(),
        // Explicit box from the ghost measurements. `content-box` because the
        // measured box already excludes padding; the surface adds its own padding
        // on top, mirroring the editor's padded content box.
        'box-sizing': 'content-box',
        ...(surfaceBox()
          ? {
              width: `${surfaceBox()!.width}px`,
              height: `${surfaceBox()!.height}px`,
            }
          : {}),
      }}
      aria-label={'codeimage-playback'}
    >
      <Show when={syncedSets()} keyed>
        {sets => (
          <>
            {/* Off-screen measurement layers: one per slide, rendering the FULL
                final code so its natural box drives the surface sizing. */}
            <For each={sets}>
              {(set, i) => (
                <MeasureLayer
                  set={set}
                  style={textStyle()}
                  onResize={box => setBoxAt(i(), box)}
                />
              )}
            </For>
            <PhaseRenderer sets={sets} frame={frame()} />
          </>
        )}
      </Show>
    </div>
  );
}

/**
 * Invisible, off-flow layer that renders a slide's full final code and reports its
 * measured box via a resize observer. Never affects the visible surface box (it is
 * absolutely positioned with a negative z-index); it only feeds the size signal
 * that the surface then reads. Kept a plain full render so its metrics match the
 * painted text exactly.
 */
function MeasureLayer(props: {
  set: KeyedTokensInfo;
  style: Record<string, string>;
  onResize: (box: BoxSize) => void;
}) {
  const tokens = createMemo<RenderToken[]>(() => fullTokens(props.set));
  // Measure the PURE content box (no padding): the surface is `content-box` and
  // adds `surfacePadding()` itself, so measuring padding here would double-count it
  // and make the playback window wider/taller than the live editor (breaks the
  // pixel-stable swap, problem P1). Same font metrics, zero padding.
  const style = createMemo(() => ({...props.style, padding: '0'}));
  let ref!: HTMLPreElement;
  createResizeObserver(
    () => ref,
    () => {
      if (!ref) return;
      // scrollWidth/Height give the intrinsic content box even when the parent is
      // smaller than the content — resilient to the surface being explicitly sized.
      props.onResize({width: ref.scrollWidth, height: ref.scrollHeight});
    },
  );
  return (
    <pre ref={ref} class={styles.measureLayer} style={style()} aria-hidden={'true'}>
      <TokenList tokens={tokens()} />
    </pre>
  );
}

interface PhaseRendererProps {
  sets: KeyedTokensInfo[];
  frame: ReturnType<typeof stateAt>;
}

/**
 * Dispatch to the right renderer for the active phase + entry mode.
 *
 *   hold        => static full render
 *   typing      => slide-0 entry from empty, per `frame.mode`
 *   transition  => slide i-1 -> i change, per `frame.mode` (the entering mode)
 */
function PhaseRenderer(props: PhaseRendererProps) {
  const currentSet = () => props.sets[props.frame.slideIndex];
  const nextSet = () => props.sets[props.frame.slideIndex + 1];

  return (
    <Show when={currentSet()} keyed>
      {set => (
        <Switch fallback={<StaticPhase set={set} frame={props.frame} />}>
          {/* Slide 0's entry from empty. */}
          <Match when={props.frame.phase === 'typing'}>
            <EntryRenderer
              from={emptyTokens(set)}
              to={set}
              mode={props.frame.mode}
              progress={props.frame.progress}
            />
          </Match>
          {/* Change from the leaving slide into the entering (next) slide. */}
          <Match when={props.frame.phase === 'transition' && nextSet()} keyed>
            {next => (
              <EntryRenderer
                from={set}
                to={next}
                mode={props.frame.mode}
                progress={props.frame.progress}
              />
            )}
          </Match>
        </Switch>
      )}
    </Show>
  );
}

/** Route an entry animation to its pure renderer based on the resolved mode. */
function EntryRenderer(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  mode: EntryMode;
  progress: number;
}) {
  return (
    <Switch fallback={<MorphPhase from={props.from} to={props.to} progress={props.progress} />}>
      <Match when={props.mode === 'typewriter'}>
        <TypewriterPhase to={props.to} progress={props.progress} />
      </Match>
      <Match when={props.mode === 'fade'}>
        <FadePhase from={props.from} to={props.to} progress={props.progress} />
      </Match>
      <Match when={props.mode === 'slide'}>
        <SlidePhase from={props.from} to={props.to} progress={props.progress} />
      </Match>
    </Switch>
  );
}

/** Static full render (steady-state hold). */
function StaticPhase(props: {
  set: KeyedTokensInfo;
  frame: ReturnType<typeof stateAt>;
}) {
  const tokens = createMemo<RenderToken[]>(() => fullTokens(props.set));
  return (
    <pre class={styles.staticLayer}>
      <TokenList tokens={tokens()} />
    </pre>
  );
}

/**
 * Typewriter entry: progressively reveal the target slide's code. On slide 0 this
 * types in from empty; on later slides it is the v1 "clear then type the new
 * slide" behaviour (the previous code is not shown during the type-in).
 */
function TypewriterPhase(props: {to: KeyedTokensInfo; progress: number}) {
  const tokens = createMemo<RenderToken[]>(() =>
    revealTypedTokens(props.to, props.progress),
  );
  // Caret blink derived deterministically from progress (pure — seek-exact).
  const caretAlpha = createMemo(() =>
    caretOpacity(props.progress, props.to.code.length),
  );
  return (
    <pre class={styles.staticLayer}>
      <TokenList tokens={tokens()} />
      <span class={styles.caret} style={{opacity: String(caretAlpha())}} />
    </pre>
  );
}

/** Whole-block crossfade (no token movement). */
function FadePhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
}) {
  const layers = createMemo(() =>
    fadeLayers(props.from, props.to, props.progress),
  );
  return (
    <>
      <pre class={styles.layer} style={{opacity: String(layers().leaving.opacity)}}>
        <TokenList tokens={layers().leaving.tokens} />
      </pre>
      <pre class={styles.layer} style={{opacity: String(layers().entering.opacity)}}>
        <TokenList tokens={layers().entering.tokens} />
      </pre>
      {/* Surface box is sized explicitly from the ghost measurements (boxSizing.ts),
          interpolated across the transition — no in-flow spacer needed here. */}
    </>
  );
}

/** Line-level slide: removed lines slide out left, added lines slide in right. */
function SlidePhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
}) {
  const layers = createMemo(() =>
    slideLines(props.from, props.to, props.progress),
  );
  return (
    <>
      <div class={styles.slideLineLayer}>
        <For each={layers().leaving}>{line => <SlideLineRow line={line} />}</For>
      </div>
      <div class={styles.slideLineLayer}>
        <For each={layers().entering}>{line => <SlideLineRow line={line} />}</For>
      </div>
      {/* Surface box is sized explicitly from the ghost measurements (boxSizing.ts). */}
    </>
  );
}

function SlideLineRow(props: {line: RenderLine}) {
  return (
    <span
      class={styles.slideLine}
      style={{
        transform: `translateX(${(props.line.translateX * 100).toFixed(3)}%)`,
        opacity: props.line.opacity === 1 ? undefined : String(props.line.opacity),
      }}
    >
      <TokenList tokens={props.line.tokens} inline />
    </span>
  );
}

/** Progress-driven cross-dissolve morph between two slides' token layouts. */
function MorphPhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
}) {
  const layers = createMemo(() =>
    morphLayers(props.from, props.to, props.progress),
  );

  const layerTransform = (translateYLines: number) =>
    `translateY(${(translateYLines * EDITOR_METRICS.lineHeight).toFixed(3)}em)`;

  return (
    <>
      <pre
        class={styles.layer}
        style={{
          opacity: String(layers().leaving.opacity),
          transform: layerTransform(layers().leaving.translateYLines),
        }}
      >
        <TokenList tokens={layers().leaving.tokens} />
      </pre>
      <pre
        class={styles.layer}
        style={{
          opacity: String(layers().entering.opacity),
          transform: layerTransform(layers().entering.translateYLines),
        }}
      >
        <TokenList tokens={layers().entering.tokens} />
      </pre>
      {/* Surface box is sized explicitly from the ghost measurements (boxSizing.ts),
          interpolated across the transition — no in-flow spacer needed here. */}
    </>
  );
}

function TokenList(props: {tokens: RenderToken[]; inline?: boolean}) {
  return (
    <For each={props.tokens}>
      {token => (
        <Show when={!token.isNewline} fallback={props.inline ? null : <br />}>
          <span
            class={styles.token}
            style={{
              color: token.color,
              opacity: token.opacity === 1 ? undefined : String(token.opacity),
              'font-style': token.fontStyle === 1 ? 'italic' : undefined,
            }}
          >
            {token.content}
          </span>
        </Show>
      )}
    </For>
  );
}
