import {Box} from '@codeimage/ui';
import {exportExclude as _exportExclude} from '@core/directives/exportExclude';
import {refitTarget} from '@core/helpers/fitScale';
import {getScaleByRatio} from '@core/helpers/getScale';
import {useModality} from '@core/hooks/isMobile';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import type {Accessor, JSX, JSXElement, ParentProps, Ref} from 'solid-js';
import {createEffect, createSignal, on, onCleanup, Show} from 'solid-js';
import * as styles from './FrameHandler.css';

const exportExclude = _exportExclude;
void exportExclude;

type FrameHandlerProps = {
  ref?: Ref<HTMLDivElement>;
  onScaleChange: (scale: number) => void;
  /**
   * `true` while the user is actively dragging a resize handle. During a drag the
   * fit scale is FROZEN (captured at pointer-down) so the frame follows the cursor
   * without the refit fighting it, and the CSS refit transition is disabled so the
   * transform tracks the drag 1:1 with no lag. On release this flips back to
   * `false`, arming the eased refit to the settled size. Defaults to never-resizing
   * when omitted (e.g. mobile / read-only hosts).
   */
  isResizing?: Accessor<boolean>;
};

/**
 * Comfortable margin (px) kept around the frame inside the visible canvas area so
 * the zoom-to-fit preview never presses the frame (and its resize handles) flush
 * against the edges. Applied on both axes.
 */
const FIT_MARGIN = 48;

export function FrameHandler(
  props: ParentProps<FrameHandlerProps>,
): JSXElement {
  const [handlerRef, setHandlerRef] = createSignal<HTMLDivElement>();
  const [canvasScale, setCanvasScale] = createSignal(1);

  const modality = useModality();

  const ratio = 0.1;

  createEffect(
    on([handlerRef], ([frame]) => {
      if (modality === 'mobile') {
        requestAnimationFrame(() => {
          const scale = getScaleByRatio(frame?.parentElement, frame, 1 + ratio);
          props.onScaleChange(scale);
          setCanvasScale(scale);
        });
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // DESKTOP ZOOM-TO-FIT
  //
  // When the frame grows taller/wider than the visible canvas area its edges (and
  // therefore the resize handles) fall off-screen and become un-grabbable — the
  // bottom handle ends up under the filmstrip. We scale `.handler` down to fit so
  // the whole box stays on-screen and editable, exactly like a design tool. Never
  // scales UP (a frame that already fits renders at 100%).
  //
  // The frame's NATURAL (untransformed) size is read from `offsetWidth/Height` of
  // the `.content` child, which the CSS transform does NOT affect — so the fit is
  // computed against real layout pixels and export size stays natural. Available
  // space is the `.wrapper`'s client box, which the surrounding flex column has
  // already shrunk to exclude the filmstrip.
  // ---------------------------------------------------------------------------
  let contentRef!: HTMLDivElement;
  const [fitScale, setFitScale] = createSignal(1);
  // The frame's natural (untransformed) size at the CURRENT displayed scale. The
  // `.handler` layout box is collapsed to this × scale so the grid centres the
  // frame by its VISUAL footprint (see `handlerStyle`). Updated ONLY when the
  // displayed scale changes — never per drag frame — so the layout box the grid
  // sees is stable during a gesture. Both default to 0 (unmeasured).
  const [naturalSize, setNaturalSize] = createSignal({width: 0, height: 0});
  // `true` while the eased refit transition should be armed on `.handler`. Turned
  // ON only for a non-drag scale change (release, panel input, window resize) and
  // OFF during a live drag, so the transform tracks the cursor with no easing lag.
  const [animateFit, setAnimateFit] = createSignal(false);
  const isResizing = () => props.isResizing?.() ?? false;

  // Read the frame's true layout size (offsetWidth/Height ignore the scale
  // transform) and the available area inside the wrapper's comfortable margin.
  const measureFit = () => {
    const handler = handlerRef();
    const wrapper = handler?.parentElement;
    if (!handler || !wrapper || !contentRef) return null;
    return {
      frame: {width: contentRef.offsetWidth, height: contentRef.offsetHeight},
      available: {
        width: wrapper.clientWidth - FIT_MARGIN * 2,
        height: wrapper.clientHeight - FIT_MARGIN * 2,
      },
    };
  };

  // Commit a new displayed scale + its natural size in one write, so the layout
  // box (scaled width/height in `handlerStyle`) and the transform change together
  // exactly once per scale change. `animate` arms the compositor-only CSS refit
  // transition for this change; it is always OFF during a drag.
  const commitScale = (
    scale: number,
    natural: {width: number; height: number},
    animate: boolean,
  ) => {
    setAnimateFit(animate);
    setNaturalSize(natural);
    setFitScale(scale);
    setCanvasScale(scale);
    props.onScaleChange(scale);
  };

  // Apply the fit for the frame's current settled size.
  //
  //   • During a drag the scale is FROZEN: we do NOT recompute it (that is the
  //     fight the user reported — the frame grew with the drag yet shrank to
  //     refit every frame). The frozen scale stays displayed; the drag deltas are
  //     already divided by it (fitScale.ts) so tracking is exact and the frame is
  //     free to overflow the fit area for the duration of the gesture.
  //   • Otherwise (release, panel input, slide switch, window resize, min-floor)
  //     we animate to the fresh fit scale with the eased CSS transition — but only
  //     when it actually changed, so an unchanged fit never re-arms the transition
  //     (no badge flicker, no pointless animation).
  const recomputeFit = () => {
    if (modality !== 'full') return;
    const measured = measureFit();
    if (!measured) return;
    if (isResizing()) return;
    const {scale, changed} = refitTarget(
      measured.frame,
      measured.available,
      fitScale(),
    );
    // Skip a no-op commit: if neither the scale nor the natural size changed there
    // is nothing to update, and re-writing would needlessly re-arm the transition
    // and can feed an observer→commit→observer loop. Only commit on a real change;
    // ARM the transition just for a scale change (a same-scale natural resize keeps
    // the layout box in sync without an animation).
    const current = naturalSize();
    const sizeChanged =
      current.width !== measured.frame.width ||
      current.height !== measured.frame.height;
    if (!changed && !sizeChanged) return;
    commitScale(scale, measured.frame, changed);
  };

  // Compositor-only fit compensation (replaces the old negative-margin approach,
  // which mutated `margin` — a LAYOUT property — on every frame and thrashed).
  //
  // The layout box (`.handler` width/height) is collapsed to the SCALED footprint
  // so the grid centres the frame by what the eye sees and nothing overflows; the
  // natural-size `.content` inside is shrunk to fill it with a `transform: scale()`
  // from the top-left. Both derive from the same `(naturalSize, scale)` pair, which
  // changes only at scale-change moments — so during a drag (frozen scale) the box
  // never relayouts, and the drag's own size writes are the only per-frame work.
  const handlerStyle = (): JSX.CSSProperties => {
    const scale = canvasScale();
    if (scale === 1) return {};
    // Mobile keeps its original behaviour: a bare `scale()` on `.handler` (its
    // wrapper is not the desktop centering grid, so no footprint collapse).
    if (modality !== 'full') return {transform: `scale(${scale})`};
    const {width, height} = naturalSize();
    return {
      width: `${Math.round(width * scale)}px`,
      height: `${Math.round(height * scale)}px`,
    };
  };

  // The `.content` style when zoomed: absolutely positioned at the scaled
  // `.handler`'s top-left and shrunk to its NATURAL size with a compositor-only
  // `transform: scale()` (origin top-left, from CSS). Absolute + natural size is
  // load-bearing: it detaches `.content` from the scaled `.handler` box so its
  // `offsetWidth/offsetHeight` keep reporting the TRUE natural frame size (what the
  // fit math and the export probe both read) instead of the shrunk footprint —
  // otherwise the fit would feed back on its own scaled measurement and oscillate.
  // At 100% (or mobile) no style is set and `.content` stays the original
  // relative/100% box (issue #42 identity case preserved).
  const contentStyle = (): JSX.CSSProperties => {
    const scale = canvasScale();
    if (scale === 1 || modality !== 'full') return {};
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      width: 'auto',
      height: 'auto',
      transform: `scale(${scale})`,
    };
  };

  createEffect(
    on([handlerRef], ([handler]) => {
      if (modality !== 'full' || !handler || !contentRef) return;
      // Recompute whenever the frame's rendered size changes (panel input, drag,
      // min floors, slide switch, playback height) or the available area resizes.
      // During a drag `recomputeFit` early-returns (frozen scale), so these fire
      // freely without fighting the gesture.
      createResizeObserver(contentRef, () => recomputeFit());
      createResizeObserver(
        () => handler.parentElement ?? undefined,
        () => recomputeFit(),
      );
      const onWindowResize = () => recomputeFit();
      window.addEventListener('resize', onWindowResize);
      onCleanup(() => window.removeEventListener('resize', onWindowResize));
      requestAnimationFrame(() => recomputeFit());
    }),
  );

  // On the resizing→false edge (drag release) refit to the settled size with the
  // eased animation. Deferred so it only fires on real transitions, not on mount.
  //
  // The measure is pushed to the NEXT animation frame: on release the vertical hook
  // commits the final height to the store, and that committed size only reflows to
  // the DOM after Solid re-renders — reading `offsetHeight` synchronously here would
  // race that and see the pre-commit size (refitting to a stale, wrong scale). One
  // rAF lets the committed size settle so the refit target is measured correctly.
  createEffect(
    on(
      isResizing,
      resizing => {
        if (resizing || modality !== 'full') return;
        requestAnimationFrame(() => {
          // A new drag may have started during the rAF — skip so we never overwrite
          // a fresh frozen scale with a refit from the previous gesture.
          if (isResizing()) return;
          const measured = measureFit();
          if (!measured) return;
          const {scale} = refitTarget(
            measured.frame,
            measured.available,
            fitScale(),
          );
          // Always animate on release: the frozen drag scale is (almost) always off
          // the fresh fit, and even a no-op refit reads as an intentional settle.
          commitScale(scale, measured.frame, true);
        });
      },
      {defer: true},
    ),
  );

  return (
    <Box class={styles.wrapper}>
      <div
        class={styles.handler}
        style={
          // At 100% (scale === 1) the element stays untransformed — issue #42
          // (autocomplete/translate) only manifests with a live transform, so the
          // identity case is a bare box, preserving the original desktop layout.
          // When zoomed, `handlerStyle` collapses the layout box to the SCALED
          // footprint (compositor-only, no margins) so the grid centres the frame.
          handlerStyle()
        }
        // Arm the eased CSS refit transition ONLY for non-drag scale changes
        // (release, panel input, window resize). Absent (off) during a live drag,
        // so the transform tracks the cursor 1:1 with zero easing lag.
        data-fit-animate={
          modality === 'full' && animateFit() && !isResizing()
            ? 'true'
            : undefined
        }
        ref={setHandlerRef}
      >
        <div
          class={styles.content}
          // Compositor-only scale: the natural-size content is shrunk from its
          // top-left to exactly fill the scaled `.handler` footprint above.
          style={contentStyle()}
          ref={contentRef}
        >
          <div
            use:exportExclude={true}
            class={styles.squaredBackgroundOverlay}
          />
          {props.children}
        </div>
      </div>

      <Show when={modality === 'full' && fitScale() < 1}>
        <Box class={styles.scaleBadge} use:exportExclude={true}>
          {Math.round(fitScale() * 100)}%
        </Box>
      </Show>
    </Box>
  );
}
