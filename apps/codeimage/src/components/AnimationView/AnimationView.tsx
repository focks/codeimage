import {getRootEditorStore} from '@codeimage/store/editor';
import {activeEditorOf} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {buildTimelineFromSlides} from '@codeimage/store/playback/playbackController';
import {stateAt, type EntryMode} from '@codeimage/store/playback/timeline';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {syncTokenKeys, type KeyedTokensInfo} from 'shiki-magic-move/core';
import {createMemo, createResource, For, Match, Show, Switch} from 'solid-js';
import {activeCustomTheme} from './activeTheme';
import * as styles from './AnimationView.css';
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

  return (
    <div
      class={styles.surface}
      style={{
        'font-family': fontFamily(),
        'font-weight': String(fontWeight()),
        // Mirror the live editor's exact box so the CanvasEditor -> AnimationView
        // swap on Play does not shift the code block (problem P1). Values are the
        // rendered `.cm-content` / `.cm-line` metrics (see editorMetrics.ts).
        'font-size': `${EDITOR_METRICS.fontSizePx}px`,
        'line-height': String(EDITOR_METRICS.lineHeight),
        'tab-size': String(EDITOR_METRICS.tabSize),
        padding: surfacePadding(),
      }}
      aria-label={'codeimage-playback'}
    >
      <Show when={syncedSets()} keyed>
        {sets => <PhaseRenderer sets={sets} frame={frame()} />}
      </Show>
    </div>
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
      {/* In-flow spacer sizes the surface to the taller of the two layouts. */}
      <pre class={styles.staticLayer} style={{visibility: 'hidden'}}>
        <TokenList tokens={fullTokens(props.to)} />
      </pre>
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
      {/* In-flow spacer sizes the surface to the final layout. */}
      <pre class={styles.staticLayer} style={{visibility: 'hidden'}}>
        <TokenList tokens={fullTokens(props.to)} />
      </pre>
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
      {/* In-flow spacer sizes the surface to the taller of the two layouts. */}
      <pre class={styles.staticLayer} style={{visibility: 'hidden'}}>
        <TokenList tokens={fullTokens(props.to)} />
      </pre>
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
