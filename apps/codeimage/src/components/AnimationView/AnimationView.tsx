import {getRootEditorStore} from '@codeimage/store/editor';
import {activeEditorOf} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {buildTimelineFromSlides} from '@codeimage/store/playback/playbackController';
import {easeInOutCubic, easeOutCubic} from '@codeimage/store/playback/easing';
import {
  resolveTypewriterCharMs,
  stateAt,
  type EntryMode,
} from '@codeimage/store/playback/timeline';
import {resolveSlideInputs} from '@codeimage/store/playback/slideAnimation';
import {
  entrySizingSettleAt,
  entrySubPhaseAt,
  typewriterSpec,
  windowSpec,
  type EntrySpec,
} from '@codeimage/store/playback/entryPhases';
import {getSlidesStore} from '@codeimage/store/slides';
import type {Slide} from '@codeimage/store/slides/model';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import {syncTokenKeys, type KeyedTokensInfo} from 'shiki-magic-move/core';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import {getExportCanvasStore} from '@codeimage/store/canvas';
import {activeCustomTheme} from './activeTheme';
import * as styles from './AnimationView.css';
import {
  resolveFollowedContainerHeight,
  resolveSurfaceBox,
  type BoxSize,
  type SlideHeightInput,
} from './boxSizing';
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

  // Resolved per-slide entry timing, mirroring timeline.ts so the renderer, the box
  // settle, and the timeline durations all agree:
  //   charMs   — ms-per-char for the type beat (per-slide override, else global rate).
  //   windowMs — fade/slide window beat (per-slide transitionMs override, else global).
  const slideEntryTiming = createMemo<{charMs: number; windowMs: number}[]>(
    () => {
      const slides = slidesStore.state.slides;
      const settings = playback.settings;
      const inputs = resolveSlideInputs(
        slides,
        slides.map(() => 0),
        settings,
      );
      return inputs.map(input => {
        const windowMs =
          input.transitionMs != null && input.transitionMs > 0
            ? input.transitionMs
            : settings.transitionMs;
        return {
          charMs: resolveTypewriterCharMs(input, settings),
          windowMs: Math.max(0, windowMs),
        };
      });
    },
  );

  // The composite ENTRY in effect for the current frame, as a unified `EntrySpec`
  // (see entryPhases.ts): typewriter => {clear?, empty, type}; fade/slide =>
  // {window, type}. Only the typing-capable modes have a spec; morph/none do not.
  //
  // The entering slide (whose code the entry reveals) is slide i+1 on a `transition`
  // into it, or slide 0 on a `typing` frame. Its char count + resolved charMs size
  // the type beat and the box settle; `hasOutgoing` (a transition — there IS previous
  // text) gates the typewriter `clear` beat. The window duration for fade/slide is
  // this frame's segment duration MINUS the type beat, so the box settle lines up
  // with the timeline's own windowMs + typeMs split.
  const enteringEntry = createMemo<
    {charMs: number; spec: EntrySpec} | undefined
  >(() => {
    const f = frame();
    if (f.mode !== 'typewriter' && f.mode !== 'fade' && f.mode !== 'slide') {
      return undefined;
    }
    const sets = syncedSets();
    const index = f.phase === 'transition' ? f.slideIndex + 1 : f.slideIndex;
    const set = sets?.[index];
    if (!set) return undefined;
    const charCount = set.code.length;
    const timing = slideEntryTiming()[index] ?? {charMs: 0, windowMs: 0};
    if (f.mode === 'typewriter') {
      return {
        charMs: timing.charMs,
        spec: typewriterSpec(
          charCount,
          timing.charMs,
          f.phase === 'transition',
        ),
      };
    }
    // fade/slide: same window + type split the timeline uses (windowEntryDurationMs).
    return {
      charMs: timing.charMs,
      spec: windowSpec(timing.windowMs, charCount, timing.charMs),
    };
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
      if (
        cur &&
        Math.abs(cur.width - box.width) < 0.5 &&
        Math.abs(cur.height - box.height) < 0.5
      ) {
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
    // Composite entries (typewriter AND fade/slide) morph the window from the
    // outgoing slide's box to the incoming slide's FULL box during their leading
    // beats (clear+empty, or the fade/slide window), then hold it FIXED while the
    // text types in — a stable window. We rescale the linear entry progress so it
    // reaches 1 at the type-beat start (`entrySizingSettleAt`) and clamps there;
    // morph transitions keep whole-segment interpolation. Slide 0's `typing` frame
    // is not a transition, so its window sits at its own full box from t=0 (no morph).
    const entry = enteringEntry();
    let progress = f.progress;
    if (f.phase === 'transition' && entry) {
      const settleAt = entrySizingSettleAt(entry.spec);
      progress = settleAt > 0 ? Math.min(1, f.progress / settleAt) : 1;
    }
    return resolveSurfaceBox({
      boxes: slideBoxes(),
      slideIndex: f.slideIndex,
      isTransition: f.phase === 'transition',
      easedProgress: easeInOutCubic(progress),
    });
  });

  // ── Followed container height (problem: explicit-height slides + smooth morph) ──
  //
  // A slide with an explicit frame height must render at that height during playback
  // and export (window stretched/clipped exactly like the editor), and a transition
  // between two slides must EASE between their followed heights instead of hard-
  // swapping the container height at the midpoint. Both are pure functions of the
  // two slides' followed heights (see boxSizing.ts) and the eased progress, so
  // preview and export size the container identically (seek-exact).
  //
  // The auto-slide branch needs the fixed window chrome (surface + frame + content
  // padding and the header) to turn a measured code box into a container height. It
  // is summed from those structural elements (not container − surface, which would
  // be wrong when the window is clipped), so it stays correct and deterministic.
  const exportCanvasStore = getExportCanvasStore();
  const [chromeOffset, setChromeOffset] = createSignal(0);

  // The fixed window chrome above/below the code surface: frame padding (both
  // sides) + window header + terminal content padding (both sides). Summed from
  // the structural elements rather than `container − surface`, so it is correct
  // even when the window is clipped/stretched (padding + header don't change with
  // the clip, unlike the container height).
  const verticalPadding = (el: HTMLElement | null): number => {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  };

  const measureChromeOffset = () => {
    const wrapper = exportCanvasStore.get.liveFrameRef;
    if (!wrapper) return;
    const container = wrapper.querySelector<HTMLElement>(
      '[data-testid="frame-container"]',
    );
    const surface = wrapper.querySelector<HTMLElement>(
      '[aria-label="codeimage-playback"]',
    );
    if (!container || !surface) return;
    // The code content area (`.content` in terminal.css) is the surface's grand-
    // parent (surface -> Box wrapper -> .content). Its padding is part of the
    // chrome that sits between the container edge and the surface box.
    const content = surface.closest<HTMLElement>('[class*="terminal_content"]');
    const header = container.querySelector<HTMLElement>(
      '[class*="terminal_header"]',
    );
    // The measured code box (`slideBoxes`) is the surface's CONTENT box (padding
    // excluded — the MeasureLayer renders with padding:0). The surface then adds
    // its own vertical padding on top, so include it here: container height =
    // contentBox + surface padding + frame padding + header + content padding.
    const offset =
      verticalPadding(surface) +
      verticalPadding(container) +
      (header?.offsetHeight ?? 0) +
      verticalPadding(content);
    if (offset > 0 && Math.abs(offset - chromeOffset()) >= 0.5) {
      setChromeOffset(offset);
    }
  };

  const slideHeightInputs = createMemo<SlideHeightInput[]>(() =>
    slidesStore.state.slides.map(slide => ({
      autoHeight: slide.frame.autoHeight ?? true,
      explicitHeight: slide.frame.height ?? 0,
    })),
  );

  const followedContainerHeight = createMemo<number | undefined>(() => {
    const f = frame();
    const offset = chromeOffset();
    // No usable chrome measurement yet -> let the container size to content.
    if (offset <= 0) return undefined;
    return resolveFollowedContainerHeight({
      slides: slideHeightInputs(),
      boxes: slideBoxes(),
      chromeOffset: offset,
      slideIndex: f.slideIndex,
      isTransition: f.phase === 'transition',
      easedProgress: easeInOutCubic(f.progress),
    });
  });

  // Publish the followed container height to the playback store so the shared Frame
  // container applies it (and clears it on unmount so the editor path is untouched).
  // The chrome offset is structural (padding + header), so it can be re-measured on
  // any frame without the container height feeding back into it.
  createEffect(() => {
    measureChromeOffset();
    playback.setFollowedHeight(followedContainerHeight() ?? null);
  });
  onCleanup(() => playback.setFollowedHeight(null));

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
            <PhaseRenderer
              sets={sets}
              frame={frame()}
              entry={enteringEntry()}
            />
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
    <pre
      ref={ref}
      class={styles.measureLayer}
      style={style()}
      aria-hidden={'true'}
    >
      <TokenList tokens={tokens()} />
    </pre>
  );
}

interface PhaseRendererProps {
  sets: KeyedTokensInfo[];
  frame: ReturnType<typeof stateAt>;
  /**
   * The unified entry spec + resolved ms-per-char for the current composite entry
   * (typewriter / fade / slide). `undefined` for morph/none/hold frames.
   */
  entry: {charMs: number; spec: EntrySpec} | undefined;
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
          {/* Slide 0's entry from empty (no outgoing text -> no clear beat). */}
          <Match when={props.frame.phase === 'typing'}>
            <EntryRenderer
              from={emptyTokens(set)}
              to={set}
              mode={props.frame.mode}
              progress={props.frame.progress}
              entry={props.entry}
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
                entry={props.entry}
              />
            )}
          </Match>
        </Switch>
      )}
    </Show>
  );
}

/**
 * Route an entry animation to its pure renderer based on the resolved mode. The
 * composite modes (typewriter / fade / slide) share the unified `entry.spec` from
 * `entryPhases.ts`; morph has no spec and cross-dissolves text directly.
 */
function EntryRenderer(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  mode: EntryMode;
  progress: number;
  /** Unified entry spec + ms-per-char for the composite modes (undefined for morph). */
  entry: {charMs: number; spec: EntrySpec} | undefined;
}) {
  return (
    <Switch
      fallback={
        <MorphPhase from={props.from} to={props.to} progress={props.progress} />
      }
    >
      <Match
        when={props.entry?.spec.kind === 'typewriter' ? props.entry : undefined}
        keyed
      >
        {entry => (
          <TypewriterPhase
            from={props.from}
            to={props.to}
            progress={props.progress}
            spec={entry.spec}
          />
        )}
      </Match>
      {/* fade & slide are the same composite (window-in-empty -> type), differing
          only in HOW the window beat animates: a crossfade vs a line-level slide. */}
      <Match
        when={props.entry?.spec.kind === 'window' ? props.entry : undefined}
        keyed
      >
        {entry => (
          <WindowEntryPhase
            from={props.from}
            to={props.to}
            progress={props.progress}
            spec={entry.spec}
            slide={props.mode === 'slide'}
          />
        )}
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
 * The `type` beat, shared by every composite entry: the incoming code reveals one
 * character at a time (linear) with a blinking caret. `localProgress` is the beat-
 * local reveal progress (0 at the empty editor, 1 at fully typed) — pure, so preview
 * and export stay seek-exact.
 */
function TypedCode(props: {to: KeyedTokensInfo; localProgress: number}) {
  const typedTokens = createMemo<RenderToken[]>(() =>
    revealTypedTokens(props.to, props.localProgress),
  );
  const caretAlpha = createMemo(() =>
    caretOpacity(props.localProgress, props.to.code.length),
  );
  return (
    <pre class={styles.staticLayer}>
      <TokenList tokens={typedTokens()} />
      <span class={styles.caret} style={{opacity: String(caretAlpha())}} />
    </pre>
  );
}

/**
 * Typewriter entry: three beats so every slide begins from a clean, empty editor
 * before its code types in one character at a time (see `entryPhases.ts`):
 *
 *   clear (slides i>0 only) => the OUTGOING code fades out quickly (eased).
 *   empty                   => nothing but the blinking caret — a clean empty beat.
 *   type                    => the incoming code reveals char-by-char (linear) + caret.
 *
 * The active beat and its local progress are a pure function of the linear entry
 * `progress` (via `entrySubPhaseAt`), so preview and export stay seek-exact.
 */
function TypewriterPhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
  spec: EntrySpec;
}) {
  const sub = createMemo(() => entrySubPhaseAt(props.progress, props.spec));
  // clear: outgoing tokens fading out (eased), no caret yet.
  const clearOpacity = createMemo(() => 1 - easeOutCubic(sub().localProgress));

  return (
    <Switch>
      <Match when={sub().phase === 'clear'}>
        <pre
          class={styles.staticLayer}
          style={{opacity: String(clearOpacity())}}
        >
          <TokenList tokens={fullTokens(props.from)} />
        </pre>
      </Match>
      <Match when={sub().phase === 'empty'}>
        {/* Clean empty-editor beat: only the blinking caret, no code. */}
        <pre class={styles.staticLayer}>
          <span class={styles.caret} style={{opacity: '1'}} />
        </pre>
      </Match>
      <Match when={sub().phase === 'type'}>
        <TypedCode to={props.to} localProgress={sub().localProgress} />
      </Match>
    </Switch>
  );
}

/**
 * Composite fade/slide entry (see `entryPhases.ts`): the outgoing code leaves while
 * the EMPTY editor arrives over the `window` beat, then the incoming code types in
 * over the `type` beat — the requirement that every fade/slide slide passes through
 * an empty-editor moment before typing.
 *
 *   window => `from` text fades/slides OUT and the empty editor fades/slides IN (the
 *             `to` layer of the window animation is EMPTY, not the final code, so no
 *             text is ever shown fully-formed before typing). On slide 0 there is no
 *             `from`, so the empty window simply fades/slides in from the canvas.
 *   type   => the caret appears and the code reveals char-by-char (shared `TypedCode`).
 *
 * `slide` picks the animation for the window beat: `false` => fade (crossfade),
 * `true` => slide (line-level LCS slide). Both are pure functions of `progress`.
 */
function WindowEntryPhase(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
  spec: EntrySpec;
  slide: boolean;
}) {
  const sub = createMemo(() => entrySubPhaseAt(props.progress, props.spec));
  // The window animation brings in an EMPTY editor, never the final text.
  const emptyTo = createMemo(() => emptyTokens(props.to));

  return (
    <Switch>
      <Match when={sub().phase === 'window' && !props.slide}>
        <FadeLayers
          from={props.from}
          to={emptyTo()}
          progress={sub().localProgress}
        />
      </Match>
      <Match when={sub().phase === 'window' && props.slide}>
        <SlideLayers
          from={props.from}
          to={emptyTo()}
          progress={sub().localProgress}
        />
      </Match>
      <Match when={sub().phase === 'type'}>
        <TypedCode to={props.to} localProgress={sub().localProgress} />
      </Match>
    </Switch>
  );
}

/** Whole-block crossfade (no token movement) between two token sets. */
function FadeLayers(props: {
  from: KeyedTokensInfo;
  to: KeyedTokensInfo;
  progress: number;
}) {
  const layers = createMemo(() =>
    fadeLayers(props.from, props.to, props.progress),
  );
  return (
    <>
      <pre
        class={styles.layer}
        style={{opacity: String(layers().leaving.opacity)}}
      >
        <TokenList tokens={layers().leaving.tokens} />
      </pre>
      <pre
        class={styles.layer}
        style={{opacity: String(layers().entering.opacity)}}
      >
        <TokenList tokens={layers().entering.tokens} />
      </pre>
      {/* Surface box is sized explicitly from the ghost measurements (boxSizing.ts),
          interpolated across the transition — no in-flow spacer needed here. */}
    </>
  );
}

/** Line-level slide: removed lines slide out left, added lines slide in right. */
function SlideLayers(props: {
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
        <For each={layers().leaving}>
          {line => <SlideLineRow line={line} />}
        </For>
      </div>
      <div class={styles.slideLineLayer}>
        <For each={layers().entering}>
          {line => <SlideLineRow line={line} />}
        </For>
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
        opacity:
          props.line.opacity === 1 ? undefined : String(props.line.opacity),
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
