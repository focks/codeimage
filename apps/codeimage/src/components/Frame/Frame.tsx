import type {AssetId} from '@codeimage/store/assets/assets';
import {getAssetsStore, isAssetUrl} from '@codeimage/store/assets/assets';
import {AssetsImage} from '@codeimage/store/assets/AssetsImage';
import {getExportCanvasStore} from '@codeimage/store/canvas';
import {getRootEditorStore} from '@codeimage/store/editor';
import {getFrameState} from '@codeimage/store/editor/frame';
import {dispatchUpdateTheme} from '@codeimage/store/effects/onThemeChange';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {Box, FadeInOutTransition} from '@codeimage/ui';
import {exportExclude as _exportExclude} from '@core/directives/exportExclude';
import {useModality} from '@core/hooks/isMobile';
import {createHorizontalResize} from '@core/hooks/resizable';
import {createVerticalResize} from '@core/hooks/verticalResizable';
import {
  MAX_FRAME_HEIGHT,
  MIN_FRAME_DRAG_HEIGHT,
  resolveFrameHeight,
  resolveFrameMinHeight,
  resolveFrameWidth,
} from '@codeimage/store/frame/model';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import {assignInlineVars} from '@vanilla-extract/dynamic';
import type {ParentComponent} from 'solid-js';
import {createEffect, on, onCleanup, onMount, Show} from 'solid-js';
import * as styles from './Frame.css';

export const exportExclude = _exportExclude;

interface FrameProps {
  background: string | AssetId | null | undefined;
  padding: number;
  radius: number;
  opacity: number;
  visible: boolean;
  readOnly: boolean;
  aspectRatio: string | null | undefined;
  /** User-set minimum window width in px. 0 disables the floor. */
  minWidth?: number;
  /** User-set minimum window height in px. 0 disables the floor. */
  minHeight?: number;
  /** `true` => width is content-driven; `false` => the explicit `width` applies. */
  autoWidth?: boolean;
  /** `true` => height is content-driven; `false` => the explicit `height` applies. */
  autoHeight?: boolean;
  /** Explicit window width in px, applied only when `autoWidth` is `false`. */
  width?: number;
  /** Explicit window height in px, applied only when `autoHeight` is `false`. */
  height?: number;
  /** Commit an explicit width (px). Turns auto-width off in the store. */
  onWidthChange: (width: number) => void;
  /** Commit an explicit height (px). Turns auto-height off in the store. */
  onHeightChange: (height: number) => void;
}

export const Frame: ParentComponent<FrameProps> = props => {
  // The live zoom-to-fit preview scale (`1` = 100%). Feeds the resize hooks so a
  // drag stays 1:1 in FRAME px while the preview is zoomed out (see fitScale.ts).
  const frameStore = getFrameState();
  const fitScale = () => frameStore.store.scale ?? 1;

  const {
    width: dragWidth,
    height: dragAspectHeight,
    onResizeStart,
    setRef,
    resizing,
    ref,
    refresh,
  } = createHorizontalResize({
    minWidth: 200,
    maxWidth: 1920,
    scale: fitScale,
    aspectRatio: () => {
      if (!props.aspectRatio) return null;
      const [w, h] = props.aspectRatio.split('/').map(Number);
      return w / h;
    },
  });

  // Vertical drag (top/bottom handles) shares the same `.container` ref as the
  // horizontal hook — see `setBothRefs`. It commits an explicit height to the
  // store on drag end (turning auto-height off); the live drag height feeds the
  // badge + CSS while dragging.
  const {
    height: dragHeight,
    onResizeStart: onVerticalResizeStart,
    resizing: resizingHeight,
    setRef: setVerticalRef,
  } = createVerticalResize({
    // Sane absolute floor keeps the window header visible; the user's own
    // minHeight (if set) can raise it. Content height is NOT a floor — dragging
    // shorter shrinks the window below its content and the code clips at the
    // bottom (CLIP-to-frame choice, the height counterpart of width's CLAMP).
    minHeight: MIN_FRAME_DRAG_HEIGHT,
    maxHeight: MAX_FRAME_HEIGHT,
    userMinHeight: () => props.minHeight ?? 0,
    onCommit: h => props.onHeightChange(h),
    scale: fitScale,
  });

  // Both resize hooks measure/drive the SAME container element.
  const setBothRefs = (el: HTMLElement) => {
    setRef(el);
    setVerticalRef(el);
  };

  const assetsStore = getAssetsStore();
  const exportCanvasStore = getExportCanvasStore();
  const playback = getPlaybackStore();

  // During a playback transition where a gradient/image background crossfades,
  // the resolver publishes two stacked layers (`from`/`to`) with per-frame
  // opacities. Only used when `to` is present; flat→flat lerps `props.background`
  // directly and this stays null (P3).
  const crossfade = () => {
    const layers = playback.backgroundLayers;
    if (!playback.isPlaying || !layers || layers.to == null) return null;
    return layers;
  };

  // The live, on-canvas frame wrapper — the subtree that hosts AnimationView
  // during playback. Registered so video export can snapshot it (image export
  // keeps using the Portal-mounted PreviewFrame).
  let wrapperRef!: HTMLDivElement;

  // The effective explicit width/height in px: the live drag value while a drag is
  // in flight (smooth feedback), otherwise the store's committed explicit value —
  // but only when that axis is NOT auto. `0`/auto => fall back to content-driven.
  const effectiveWidth = () => {
    if (resizing()) return dragWidth();
    return props.autoWidth === false ? (props.width ?? 0) : 0;
  };
  const effectiveHeight = () => {
    if (resizingHeight()) return dragHeight();
    // The aspect-ratio picker also drives a height via the horizontal hook; honour
    // it when set. Otherwise use the explicit store height when auto-height is off.
    if (dragAspectHeight()) return dragAspectHeight();
    return props.autoHeight === false ? (props.height ?? 0) : 0;
  };

  // ---------------------------------------------------------------------------
  // RENDERED FRAME SIZE — required semantics (must hold in edit, playback, and
  // export; floors are reactive to the panel values):
  //
  //   rendered width  = max(basisW, userMinWidth)
  //     basisW = explicit width  when auto-width off, else content natural width
  //   rendered height = max(basisH, userMinHeight)
  //     basisH = explicit height when auto-height off, else content natural height
  //
  // The floor must therefore win when it EXCEEDS the basis, but the CONTENT must
  // still win when it exceeds the floor (the floor is a minimum, never a cap).
  //
  // Width: the basis (or floor) is the `width` value; `min-width: max-content`
  // keeps content growing past the floor (intrinsic keyword, never clipped). A
  // floor > 0 with no explicit width is a plain `${floor}px`; with an explicit
  // width it is `max(<width>px, <floor>px)` — both definite lengths, valid CSS.
  //
  // Height: `max(100%, <floor>px)` does NOT work — `100%` resolves against the
  // ancestor `.handler`, whose height is `auto` (content-driven, centred in the
  // grid, never stretched), so the percentage collapses and the `max()` never
  // reaches the floor. The floor is instead applied through `min-height` as a
  // plain pixel length (see `computedMinHeight`), which natively yields
  // `max(basisH, floor)` in every mode — content-driven, explicit, and playback
  // followed — while still letting taller content grow past the floor.
  // ---------------------------------------------------------------------------
  const computedWidth = () =>
    resolveFrameWidth(effectiveWidth(), props.minWidth ?? 0);

  // During playback the followed container height is interpolated per frame by
  // AnimationView (so an explicit-height slide follows its height and a transition
  // eases smoothly between two slides' followed heights). When present it wins over
  // the store height — the editor path (no playback height) is unaffected.
  const playbackHeight = () =>
    playback.isPlaying ? playback.followedHeight : null;

  // The basis height only — the floor is NOT baked in here (it lives in
  // `computedMinHeight`). `100%` keeps the box content-driven; an explicit
  // drag/store/aspect/playback height pins it to a definite pixel size.
  const computedHeight = () =>
    resolveFrameHeight(playbackHeight() ?? effectiveHeight());

  // The user height floor, applied as a native `min-height` length so it yields
  // `max(basisH, floor)` in every mode (see the semantics note above).
  const computedMinHeight = () => resolveFrameMinHeight(props.minHeight ?? 0);

  // The window fills (stretches to) the frame's content box only when an EXPLICIT
  // height is applied — a live vertical drag, the committed store height with
  // auto-height off, or the interpolated playback followed height. In that case the
  // grid row is a fixed pixel height and the item stretches to it, so the window
  // follows the frame: it grows past the content (empty space below the code) or
  // shrinks below it (code clips at the bottom — the terminal's `overflow: hidden`).
  // Otherwise (content-driven / aspect-ratio height) the window stays content-sized
  // and vertically centred.
  const windowFollowsHeight = () =>
    resizingHeight() ||
    playbackHeight() != null ||
    (props.autoHeight === false && (props.height ?? 0) > 0);
  const alignItems = () => (windowFollowsHeight() ? 'stretch' : 'center');

  // Badge shows whichever axis is actively being dragged.
  const roundedWidth = () => `${Math.floor(dragWidth())}px`;
  const roundedHeight = () => `${Math.floor(dragHeight())}px`;
  const modality = useModality();

  // Commit the horizontal drag width to the store on drag end so it persists per
  // slide (the width was previously ephemeral). Fires on the resizing→false edge.
  createEffect(
    on(
      resizing,
      isResizing => {
        if (!isResizing && dragWidth() > 0) {
          props.onWidthChange(Math.round(dragWidth()));
        }
      },
      {defer: true},
    ),
  );

  // Publish the combined resize state (either axis) to the frame store so
  // FrameHandler can FREEZE the zoom-to-fit scale for the whole gesture and gate
  // off the eased refit transition — the frame then follows the cursor without the
  // fit recomputing under it (the "steppy" fight). Reset on the release edge, which
  // is what arms FrameHandler's eased refit to the settled size.
  const anyResizing = () => resizing() || resizingHeight();
  createEffect(
    on(
      anyResizing,
      dragging => frameStore.setResizing(dragging),
      {defer: true},
    ),
  );

  onMount(() => {
    exportCanvasStore.setLiveFrameRef(wrapperRef);
    onCleanup(() => exportCanvasStore.setLiveFrameRef(undefined));

    const refValue = ref();
    if (!refValue) return;

    const preview = refValue.querySelector('[data-preview]');
    createResizeObserver(
      () => preview,
      () => {
        refresh();
      },
    );
  });

  const borderRadius = () => {
    const radius = props.radius;
    if (!radius) return '0';
    if (isNaN(props.radius)) return String(radius);
    return `${radius}px`;
  };

  return (
    <div
      ref={wrapperRef}
      style={assignInlineVars({
        [styles.frameVars.radius]: borderRadius(),
        [styles.frameVars.aspectRatio]: 'unset',
      })}
      class={styles.wrapper}
    >
      <div
        ref={setBothRefs}
        class={styles.container}
        data-testid={'frame-container'}
        data-playback={playback.isPlaying ? 'true' : undefined}
        style={assignInlineVars({
          [styles.frameVars.width]: computedWidth(),
          [styles.frameVars.height]: computedHeight(),
          [styles.frameVars.minHeight]: computedMinHeight(),
          [styles.frameVars.padding]: `${props.padding}px`,
          [styles.frameVars.alignItems]: alignItems(),
        })}
      >
        <div
          data-frame-content
          class={styles.overlay}
          style={assignInlineVars({
            [styles.frameVars.backgroundColor]: assetsStore.isAssetUrl(
              props.background,
            )
              ? 'transparent'
              : (props.background ?? 'transparent'),
            [styles.frameVars.opacity]: `${props.opacity}%`,
            [styles.frameVars.visibility]: `${
              props.visible ? 'visible' : 'hidden'
            }`,
          })}
        >
          <Show when={isAssetUrl(props.background) && props.background}>
            {assetId => (
              <AssetsImage
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  'object-fit': 'cover',
                }}
                onError={() => {
                  return dispatchUpdateTheme({
                    updateBackground: true,
                    theme: getRootEditorStore().state.options.themeId,
                  });
                }}
                assetId={assetId()}
              />
            )}
          </Show>
          <Show when={crossfade()}>
            {layers => (
              <>
                <div
                  class={styles.backgroundLayer}
                  style={{
                    background: layers().from ?? 'transparent',
                    opacity: String(layers().fromOpacity),
                  }}
                />
                <div
                  class={styles.backgroundLayer}
                  style={{
                    background: layers().to ?? 'transparent',
                    opacity: String(layers().toOpacity),
                  }}
                />
              </>
            )}
          </Show>
        </div>

        <Show when={modality === 'full' && !props.readOnly}>
          <div class={styles.dragControls} use:exportExclude={true}>
            <div
              class={styles.dragControlLeft}
              data-testid={'frame-resize-left'}
              onMouseDown={onResizeStart}
            />
            <div
              class={styles.dragControlRight}
              data-testid={'frame-resize-right'}
              onMouseDown={onResizeStart}
            />
            <div
              class={styles.dragControlTop}
              data-testid={'frame-resize-top'}
              onMouseDown={onVerticalResizeStart}
            />
            <div
              class={styles.dragControlBottom}
              data-testid={'frame-resize-bottom'}
              onMouseDown={onVerticalResizeStart}
            />
          </div>
        </Show>

        {props.children}
      </div>

      <FadeInOutTransition show={resizing()}>
        <Box
          class={styles.resizeLine}
          ref={el => exportExclude(el, () => true)}
        >
          <Box class={styles.resizeBadge}>{roundedWidth()}</Box>
          <hr class={styles.resizeLineDivider} />
        </Box>
      </FadeInOutTransition>

      <FadeInOutTransition show={resizingHeight()}>
        <Box
          class={styles.resizeLineVertical}
          ref={el => exportExclude(el, () => true)}
        >
          <Box class={styles.resizeBadge}>{roundedHeight()}</Box>
          <hr class={styles.resizeLineDividerVertical} />
        </Box>
      </FadeInOutTransition>
    </div>
  );
};
