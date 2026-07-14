import {makeEventListenerStack} from '@solid-primitives/event-listener';
import type {Accessor} from 'solid-js';
import {
  batch,
  createEffect,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';
import {createStore} from 'solid-js/store';
import {fitAspect} from '../helpers/aspectRatio';
import {scaleCorrectedPointer} from '../helpers/fitScale';
import {
  computeResizeWidth,
  resolveHandleDirection,
  type HorizontalResizeGeometry,
} from './resizeMath';

interface CreateDraggableReturn {
  width: Accessor<number>;
  height: Accessor<number>;
  resizing: Accessor<boolean>;
  ref: Accessor<HTMLElement | undefined>;
  setRef: (el: HTMLElement) => void;
  onResizeStart: (event: MouseEvent) => void;
  refresh(): void;
}

interface CreateDraggableOptions {
  minWidth?: number;
  maxWidth?: number;
  aspectRatio?: Accessor<number | null>;
  /**
   * The current zoom-to-fit preview scale (`1` = 100%). When the frame is scaled
   * down to fit, the cursor moves `scale`× slower across it, so raw pointer deltas
   * are divided by this to keep the drag 1:1 in FRAME pixels. Defaults to 1.
   */
  scale?: Accessor<number>;
}

interface CreateDraggableState {
  width: number;
  height: number;
  startWidth: number;
  startX: number;
}

export function createHorizontalResize(
  options?: CreateDraggableOptions,
): CreateDraggableReturn {
  const [ref, setRef] = createSignal<HTMLElement>();
  const [resizing, setResizing] = createSignal<boolean>(false);
  const [minWidth, setMinWidth] = createSignal<number>(options?.minWidth ?? 0);
  const [maxWidth, setMaxWidth] = createSignal<number>(options?.maxWidth ?? 0);

  const [state, setState] = createStore<CreateDraggableState>({
    startWidth: 0,
    width: 0,
    height: 0,
    startX: 0,
  });

  // Drag geometry captured once at pointer-down (direction + content floor), so a
  // live move is pure arithmetic with no forced layout. Null when not dragging.
  let geometry: HorizontalResizeGeometry | null = null;
  // rAF coalescing: a fast pointer fires many moves per frame. We keep only the
  // latest X and flush it once per animation frame, so the box tracks the cursor
  // 1:1 without ever running the resize math (or a reactive write) more than once
  // per painted frame. This replaces the old "drop the move while busy" guard,
  // which fell arbitrarily far behind the cursor on a fast drag.
  let pendingX: number | null = null;
  let rafId = 0;

  const onResizeStart = ({clientX}: MouseEvent): void => {
    if (!resizing()) {
      resizeStart(clientX);
    }
  };

  const onMouseUp = (): void => {
    if (resizing()) {
      resizeEnd();
    }
  };

  const onMouseMove = ({clientX}: MouseEvent): void => {
    if (resizing()) {
      queueMove(clientX);
    }
  };

  const onMouseLeave = (): void => {
    if (!resizing()) {
      resizeEnd();
    }
  };

  /**
   * Measure the intrinsic content floor once: the width the browser renders when
   * the requested width is smaller than the content (`min-width: max-content`).
   * The one forced layout of a drag lives here, at pointer-down — not per move.
   */
  const measureContentFloor = (elementRef: HTMLElement): number => {
    const prev = elementRef.style.width;
    elementRef.style.setProperty('width', '0px');
    const floor = Math.floor(elementRef.getBoundingClientRect().width);
    if (prev) elementRef.style.setProperty('width', prev);
    else elementRef.style.removeProperty('width');
    return floor;
  };

  const measureContentHeight = (elementRef: HTMLElement): number => {
    const prev = elementRef.style.height;
    elementRef.style.setProperty('height', 'auto');
    const height = Math.floor(elementRef.clientHeight);
    if (prev) elementRef.style.setProperty('height', prev);
    else elementRef.style.removeProperty('height');
    return height;
  };

  // The natural content height at drag start, used to floor the aspect-ratio
  // height so a wide/aspect drag never crops the code. Cached with the geometry.
  let contentHeightFloor = 0;

  const queueMove = (x: number): void => {
    pendingX = x;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const x = pendingX;
      pendingX = null;
      if (x != null) resizeMove(x);
    });
  };

  const cancelPendingMove = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    pendingX = null;
  };

  // Turn a resolved width into state, applying the aspect-ratio coupling. Shared by
  // the live drag (pure math) and the refresh/aspect recompute (measured once).
  const applyWidth = (newWidth: number): void => {
    const aspectRatio = options?.aspectRatio?.();
    if (aspectRatio) {
      let newHeight = Math.floor(newWidth / aspectRatio);
      if (newHeight < contentHeightFloor) newHeight = contentHeightFloor;
      const aspect = fitAspect({ratio: aspectRatio, height: newHeight});
      setState({height: aspect.height, width: aspect.width});
    } else {
      setState({width: newWidth});
    }
  };

  // Live drag: pure arithmetic against the geometry captured at pointer-down. No
  // DOM reads, no forced layout — so the box edge tracks the cursor 1:1. When the
  // zoom-to-fit preview is scaled down, the raw screen X is mapped onto the frame
  // axis (delta / scale) so the drag stays 1:1 in FRAME px rather than feeling
  // slowed. At scale 1 this is the identity.
  const resizeMove = (x: number): void => {
    if (!geometry) return;
    const correctedX = scaleCorrectedPointer(x, geometry.startX, options?.scale?.() ?? 1);
    applyWidth(computeResizeWidth(correctedX, geometry));
  };

  // Refresh / aspect-ratio change: not a hot path. Re-measure the content floors
  // and re-clamp the CURRENT width (content may have grown/shrunk, or the ratio
  // changed). Runs at most on structural changes, never per pointer-move.
  const recompute = (): void => {
    const elementRef = ref();
    if (!elementRef) return;
    contentHeightFloor = measureContentHeight(elementRef);
    const contentFloor = measureContentFloor(elementRef);
    const current = state.width || Math.floor(elementRef.getBoundingClientRect().width);
    const floor = Math.max(contentFloor, minWidth(), 0);
    const max = maxWidth();
    let width = current < floor ? floor : current;
    if (max > 0 && width > max) width = max;
    applyWidth(Math.round(width));
  };

  const captureGeometry = (
    elementRef: HTMLElement,
  ): HorizontalResizeGeometry => {
    const {width, left} = elementRef.getBoundingClientRect();
    const centre = left + width / 2;
    return {
      startWidth: state.startWidth || Math.floor(width),
      startX: state.startX,
      isLTR: resolveHandleDirection(state.startX, centre),
      contentFloor: measureContentFloor(elementRef),
      minWidth: minWidth(),
      maxWidth: maxWidth(),
    };
  };

  const resizeStart = (x: number): void =>
    batch(() => {
      setResizing(true);
      const elementRef = untrack(ref);
      const initialWidth = (state.width || elementRef?.offsetWidth) ?? 0;
      setState({startWidth: initialWidth, startX: x});
      // Capture the drag geometry (direction + content floors) ONCE, here, so the
      // per-move path never forces layout. The content HEIGHT floor is only needed
      // for the aspect-ratio coupling, so skip that reflow on a plain width drag.
      if (elementRef) {
        contentHeightFloor = options?.aspectRatio?.()
          ? measureContentHeight(elementRef)
          : 0;
        geometry = captureGeometry(elementRef);
      }
    });

  const resizeEnd = (): void => {
    // Flush any pending frame so the committed width equals the last dragged X
    // exactly (nothing visually jumps at commit).
    if (pendingX != null && geometry) resizeMove(pendingX);
    cancelPendingMove();
    geometry = null;
    setResizing(false);
  };

  const width = () => state.width;
  const height = () => state.height;

  createEffect(
    on(ref, ref => {
      if (!ref) {
        return;
      }

      batch(() => {
        setMinWidth(
          options?.minWidth ||
            Number(
              window.getComputedStyle(ref, '0px').minWidth.split('px')[0],
            ) ||
            0,
        );

        setMaxWidth(
          options?.maxWidth ||
            Number(
              window.getComputedStyle(ref, '0px').maxWidth.split('px')[0],
            ) ||
            0,
        );
      });

      createEffect(
        on(
          () => options?.aspectRatio?.(),
          ratio => {
            if (!ratio) {
              setState({height: 0});
              return;
            }
            recompute();
          },
          {
            defer: true,
          },
        ),
      );
    }),
  );

  createEffect(
    on(
      () => ref()?.ownerDocument,
      ownerDocument => {
        if (!ownerDocument) return;
        const [listen, clear] = makeEventListenerStack(ownerDocument);
        createEffect(
          on(resizing, resizing => {
            const ownerDocument = ref()?.ownerDocument;
            if (!ownerDocument) {
              return;
            }
            if (resizing) {
              listen('mousemove', onMouseMove, {passive: true});
              listen('mouseup', onMouseUp);
              listen('mouseleave', onMouseLeave);
            } else {
              clear();
            }
          }),
        );
        onCleanup(() => clear());
      },
    ),
  );

  onCleanup(cancelPendingMove);

  return {
    ref,
    setRef,
    resizing,
    width,
    height,
    onResizeStart,
    refresh() {
      recompute();
    },
  };
}
