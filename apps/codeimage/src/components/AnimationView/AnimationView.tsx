import {getRootEditorStore} from '@codeimage/store/editor';
import {getUiStore} from '@codeimage/store/ui';
import {activeEditorOf} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {buildTimelineFromSlides} from '@codeimage/store/playback/playbackController';
import {stateAt} from '@codeimage/store/playback/timeline';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {syncTokenKeys, type KeyedTokensInfo} from 'shiki-magic-move/core';
import {createMemo, createResource, For, Show} from 'solid-js';
import * as styles from './AnimationView.css';
import {
  ensureHighlighter,
  keyedTokensFor,
  shikiThemeFor,
} from './shikiHighlighter';
import {
  fullTokens,
  morphLayers,
  revealTypedTokens,
  type RenderToken,
} from './tokenReveal';

/**
 * Animated code surface shown during playback in place of CodeMirror. Reads the
 * injected `playback.currentTimeMs` and renders a pure function of it: typing
 * reveal, static hold, or a progress-driven cross-dissolve morph between slides.
 *
 * Seeking (phase 3): everything below derives from `stateAt(timeline, tMs)` and
 * the pure token helpers — no wall-clock reads, no DOM measurement, no reliance
 * on CSS-transition timing. Setting `currentTimeMs` to any value reproduces the
 * exact same DOM, which is what deterministic export needs.
 */
export function AnimationView() {
  const slidesStore = getSlidesStore();
  const playback = getPlaybackStore();
  const editor = getRootEditorStore();
  const ui = getUiStore();

  const theme = createMemo(() => shikiThemeFor(ui.currentTheme() === 'dark'));

  const fontFamily = createMemo(() => {
    const font = editor.computed.selectedFont();
    return `${font?.name ?? 'monospace'}, monospace`;
  });
  const fontWeight = createMemo(() => editor.state.options.fontWeight ?? 400);

  // Build keyed tokens for every slide once (recomputed if slides/theme change).
  const [tokenSets] = createResource(
    () => ({
      slides: slidesStore.state.slides,
      theme: theme(),
    }),
    async ({slides, theme}): Promise<KeyedTokensInfo[]> => {
      const langs = slides.map(s => activeEditorOf(s).languageId);
      const highlighter = await ensureHighlighter(langs, [theme]);
      return slides.map((slide: Slide) => {
        const {code, languageId} = activeEditorOf(slide);
        return keyedTokensFor(highlighter, code, languageId, theme);
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
        'font-size': '16px',
        'line-height': '1.5',
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

function PhaseRenderer(props: PhaseRendererProps) {
  const currentSet = () => props.sets[props.frame.slideIndex];
  const nextSet = () => props.sets[props.frame.slideIndex + 1];

  return (
    <Show when={currentSet()} keyed>
      {set => (
        <Show
          when={props.frame.phase === 'transition' && nextSet()}
          fallback={<StaticPhase set={set} frame={props.frame} />}
        >
          {next => (
            <MorphPhase from={set} to={next()} progress={props.frame.progress} />
          )}
        </Show>
      )}
    </Show>
  );
}

/** Typing reveal or a fully-visible hold, both fully in-flow. */
function StaticPhase(props: {
  set: KeyedTokensInfo;
  frame: ReturnType<typeof stateAt>;
}) {
  const tokens = createMemo<RenderToken[]>(() =>
    props.frame.phase === 'typing'
      ? revealTypedTokens(props.set, props.frame.progress)
      : fullTokens(props.set),
  );
  const showCaret = () => props.frame.phase === 'typing';

  return (
    <pre class={styles.staticLayer}>
      <TokenList tokens={tokens()} />
      <Show when={showCaret()}>
        <span class={styles.caret} />
      </Show>
    </pre>
  );
}

/** Progress-driven cross-dissolve between two slides' token layouts. */
function MorphPhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
}) {
  const layers = createMemo(() =>
    morphLayers(props.from, props.to, props.progress),
  );

  const layerTransform = (translateYLines: number) =>
    `translateY(${(translateYLines * 1.5).toFixed(3)}em)`;

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

function TokenList(props: {tokens: RenderToken[]}) {
  return (
    <For each={props.tokens}>
      {token => (
        <Show when={!token.isNewline} fallback={<br />}>
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
