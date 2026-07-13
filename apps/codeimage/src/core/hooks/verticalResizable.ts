import {makeEventListenerStack} from '@solid-primitives/event-listener';
import type {Accessor} from 'solid-js';
import {batch, createEffect, createSignal, on, onCleanup, untrack} from 'solid-js';
import {createStore} from 'solid-js/store';

/**
 * Vertical drag-to-resize for the frame window — the height counterpart of
 * {@link createHorizontalResize}. Kept deliberately smaller: height has no
 * aspect-ratio coupling (that axis is driven by the width hook), so this only has
 * to translate a top/bottom-edge drag into a clamped pixel height.
 *
 * The drag is symmetric: dragging either the top or the bottom handle grows the
 * box away from its vertical centre, matching how the horizontal handles grow the
 * box away from its horizontal centre. The live height is exposed as a signal for
 * the badge/preview and committed to the store via `onCommit` on drag end.
 */

interface CreateVerticalResizeReturn {
  /** Live drag height in px (0 when not dragging / not yet started). */
  height: Accessor<number>;
  resizing: Accessor<boolean>;
  ref: Accessor<HTMLElement | undefined>;
  setRef: (el: HTMLElement) => void;
  onResizeStart: (event: MouseEvent) => void;
}

interface CreateVerticalResizeOptions {
  minHeight: number;
  maxHeight: number;
  /** The natural (content) height floor — the box never shrinks below its content. */
  contentHeight: () => number;
  /** Called with the final clamped height when a drag ends. */
  onCommit: (height: number) => void;
}

interface VerticalResizeState {
  height: number;
  startHeight: number;
  startY: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (max > 0 && value > max) return max;
  return value;
}

export function createVerticalResize(
  options: CreateVerticalResizeOptions,
): CreateVerticalResizeReturn {
  const [ref, setRef] = createSignal<HTMLElement>();
  const [resizing, setResizing] = createSignal<boolean>(false);

  const [state, setState] = createStore<VerticalResizeState>({
    height: 0,
    startHeight: 0,
    startY: 0,
  });

  const resizeStart = (y: number): void =>
    batch(() => {
      setResizing(true);
      const initialHeight = (state.height || untrack(ref)?.offsetHeight) ?? 0;
      setState({startHeight: initialHeight, startY: y});
    });

  const resizeMove = (y: number): void => {
    const elementRef = ref();
    if (!elementRef) return;
    const {top, height} = elementRef.getBoundingClientRect();
    const middle = top + height / 2;
    // Grow away from the vertical centre: pulling the bottom handle down or the
    // top handle up both enlarge the box (mirrors the horizontal LTR/RTL logic).
    const isTop = state.startY < middle;
    const delta = isTop ? state.startY - y : y - state.startY;
    // The content's natural height is the hard floor — the window can never crop
    // its own content, matching how width clamps to `max-content` (CLAMP choice).
    const floor = Math.max(options.minHeight, Math.floor(options.contentHeight()));
    const next = clamp(state.startHeight + delta, floor, options.maxHeight);
    setState({height: next});
  };

  const resizeEnd = (): void => {
    if (!resizing()) return;
    setResizing(false);
    if (state.height > 0) options.onCommit(Math.round(state.height));
  };

  const onResizeStart = ({clientY}: MouseEvent): void => {
    if (!resizing()) resizeStart(clientY);
  };
  const onMouseMove = ({clientY}: MouseEvent): void => {
    if (resizing()) resizeMove(clientY);
  };

  createEffect(
    on(
      () => ref()?.ownerDocument,
      ownerDocument => {
        if (!ownerDocument) return;
        const [listen, clear] = makeEventListenerStack(ownerDocument);
        createEffect(
          on(resizing, isResizing => {
            if (isResizing) {
              listen('mousemove', onMouseMove, {passive: true});
              listen('mouseup', resizeEnd);
              listen('mouseleave', resizeEnd);
            } else {
              clear();
            }
          }),
        );
        onCleanup(() => clear());
      },
    ),
  );

  return {
    ref,
    setRef,
    resizing,
    height: () => state.height,
    onResizeStart,
  };
}
