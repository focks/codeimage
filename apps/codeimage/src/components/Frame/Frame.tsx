import type {AssetId} from '@codeimage/store/assets/assets';
import {getAssetsStore, isAssetUrl} from '@codeimage/store/assets/assets';
import {AssetsImage} from '@codeimage/store/assets/AssetsImage';
import {getExportCanvasStore} from '@codeimage/store/canvas';
import {getRootEditorStore} from '@codeimage/store/editor';
import {dispatchUpdateTheme} from '@codeimage/store/effects/onThemeChange';
import {Box, FadeInOutTransition} from '@codeimage/ui';
import {exportExclude as _exportExclude} from '@core/directives/exportExclude';
import {useModality} from '@core/hooks/isMobile';
import {createHorizontalResize} from '@core/hooks/resizable';
import {createResizeObserver} from '@solid-primitives/resize-observer';
import {assignInlineVars} from '@vanilla-extract/dynamic';
import type {ParentComponent} from 'solid-js';
import {onCleanup, onMount, Show} from 'solid-js';
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
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
}

export const Frame: ParentComponent<FrameProps> = props => {
  const {width, height, onResizeStart, setRef, resizing, ref, refresh} =
    createHorizontalResize({
      minWidth: 200,
      maxWidth: 1920,
      aspectRatio: () => {
        if (!props.aspectRatio) return null;
        const [w, h] = props.aspectRatio.split('/').map(Number);
        return w / h;
      },
    });

  const assetsStore = getAssetsStore();
  const exportCanvasStore = getExportCanvasStore();

  // The live, on-canvas frame wrapper — the subtree that hosts AnimationView
  // during playback. Registered so video export can snapshot it (image export
  // keeps using the Portal-mounted PreviewFrame).
  let wrapperRef!: HTMLDivElement;

  // Enforce the user-set minimum on the resolved size. The container's
  // `min-width: max-content` / `min-height: 100%` stay intact (content is never
  // clipped and still grows past the floor), while a length floor is applied
  // here on `width`/`height`. `max(<length>, <length>)` is valid CSS; the
  // intrinsic `auto`/`100%` case falls back to the floor as a plain length.
  const computedWidth = () => {
    const size = width();
    const floor = props.minWidth ?? 0;
    if (size && floor > 0) return `max(${size}px, ${floor}px)`;
    if (size) return `${size}px`;
    return floor > 0 ? `${floor}px` : 'auto';
  };

  const computedHeight = () => {
    const size = height();
    const floor = props.minHeight ?? 0;
    if (size && floor > 0) return `max(${size}px, ${floor}px)`;
    if (size) return `${size}px`;
    return floor > 0 ? `max(100%, ${floor}px)` : '100%';
  };

  const roundedWidth = () => `${Math.floor(width())}px`;
  const modality = useModality();

  createResizeObserver(ref, () => {
    setTimeout(() => {
      const refValue = ref();
      if (!refValue) return;
      const {clientWidth, clientHeight} = refValue;
      props.onWidthChange(clientWidth);
      props.onHeightChange(clientHeight);
    });
  });

  onMount(() => {
    exportCanvasStore.setLiveFrameRef(wrapperRef);
    onCleanup(() => exportCanvasStore.setLiveFrameRef(undefined));

    const refValue = ref();
    if (!refValue) return;

    props.onWidthChange?.(refValue.clientWidth ?? 0);

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
        ref={setRef}
        class={styles.container}
        style={assignInlineVars({
          [styles.frameVars.width]: computedWidth(),
          [styles.frameVars.height]: computedHeight(),
          [styles.frameVars.padding]: `${props.padding}px`,
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
        </div>

        <Show when={modality === 'full' && !props.readOnly}>
          <div class={styles.dragControls} use:exportExclude={true}>
            <div class={styles.dragControlLeft} onMouseDown={onResizeStart} />
            <div class={styles.dragControlRight} onMouseDown={onResizeStart} />
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
    </div>
  );
};
