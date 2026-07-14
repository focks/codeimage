import {Box} from '@codeimage/ui';
import {exportExclude as _exportExclude} from '@core/directives/exportExclude';
import {computeFitScale} from '@core/helpers/fitScale';
import {getScaleByRatio} from '@core/helpers/getScale';
import {useModality} from '@core/hooks/isMobile';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import type {JSXElement, ParentProps, Ref} from 'solid-js';
import {createEffect, createSignal, on, onCleanup, Show} from 'solid-js';
import * as styles from './FrameHandler.css';

const exportExclude = _exportExclude;
void exportExclude;

type FrameHandlerProps = {
  ref?: Ref<HTMLDivElement>;
  onScaleChange: (scale: number) => void;
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
  // Natural (untransformed) frame size, tracked so the transform-scale layout can
  // be margin-compensated (see below). Both default to 0 (unmeasured).
  const [naturalSize, setNaturalSize] = createSignal({width: 0, height: 0});

  const recomputeFit = () => {
    if (modality !== 'full') return;
    const handler = handlerRef();
    const wrapper = handler?.parentElement;
    if (!handler || !wrapper || !contentRef) return;
    // Natural (untransformed) frame size — offsetWidth/Height ignore the scale
    // transform, so this is the true layout size the frame would occupy at 100%.
    const frameW = contentRef.offsetWidth;
    const frameH = contentRef.offsetHeight;
    const availW = wrapper.clientWidth - FIT_MARGIN * 2;
    const availH = wrapper.clientHeight - FIT_MARGIN * 2;
    const scale = computeFitScale(
      {width: frameW, height: frameH},
      {width: availW, height: availH},
    );
    setNaturalSize({width: frameW, height: frameH});
    setFitScale(scale);
    setCanvasScale(scale);
    props.onScaleChange(scale);
  };

  // A CSS `transform: scale()` shrinks the box VISUALLY but the LAYOUT box keeps
  // its natural size, so an oversized frame still overflows the (centering) grid
  // wrapper and gets mis-placed — the bottom handle lands off-screen even though
  // the visual box would fit. Compensate by collapsing the layout box to the
  // scaled size with negative margins of half the size difference on each axis, so
  // the wrapper centres the box by its VISUAL footprint and nothing overflows.
  const handlerStyle = () => {
    const scale = canvasScale();
    if (scale === 1) return {};
    // Mobile keeps its original behaviour: a bare `scale()` with no margin
    // compensation (its wrapper is not the desktop centering grid).
    if (modality !== 'full') return {transform: `scale(${scale})`};
    const {width, height} = naturalSize();
    const mx = (width * (1 - scale)) / 2;
    const my = (height * (1 - scale)) / 2;
    return {
      transform: `scale(${scale})`,
      margin: `${-my}px ${-mx}px`,
    };
  };

  createEffect(
    on([handlerRef], ([handler]) => {
      if (modality !== 'full' || !handler || !contentRef) return;
      // Recompute whenever the frame's rendered size changes (panel input, drag,
      // min floors, slide switch, playback height) or the available area resizes.
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

  return (
    <Box class={styles.wrapper}>
      <div
        class={styles.handler}
        style={
          // At 100% (scale === 1) the element stays untransformed — issue #42
          // (autocomplete/translate) only manifests with a live transform, so the
          // identity case is a bare box, preserving the original desktop layout.
          // When zoomed, `handlerStyle` also applies the margin-compensation that
          // keeps the scaled box centred and on-screen (see recomputeFit).
          handlerStyle()
        }
        ref={setHandlerRef}
      >
        <div class={styles.content} ref={contentRef}>
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
