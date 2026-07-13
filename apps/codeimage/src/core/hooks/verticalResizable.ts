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
import {
  computeResizeHeight,
  type VerticalResizeGeometry,
} from './resizeMath';

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
 *
 * Unlike width (which clamps to `max-content` so the code never wraps), height is
 * allowed to shrink BELOW the content's natural height: the window follows the
 * frame and the code area simply clips at the bottom (overflow hidden). The only
 * floor is the user's `minHeight` (if set) OR a small sane minimum so the window
 * header stays visible — never the content height.
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
  /**
   * Absolute hard minimum in px — the smallest the window is ever allowed to be
   * (keeps the header visible). The effective floor is `max(this, userMinHeight)`.
   */
  minHeight: number;
  maxHeight: number;
  /**
   * The user-set minimum window height in px (`0` = off). Raises the floor above
   * {@link minHeight} but is NOT the content height, so the drag can still shrink
   * the window below its natural content (the code clips — CLIP-to-frame choice).
   */
  userMinHeight: () => number;
  /** Called with the final clamped height when a drag ends. */
  onCommit: (height: number) => void;
}

interface VerticalResizeState {
  height: number;
  startHeight: number;
  startY: number;
}

/**
 * The effective height floor for a vertical drag: the larger of the absolute hard
 * minimum (keeps the header visible) and the user-set minHeight (`0` = off). Pure
 * so it can be unit-tested independently of the drag machinery. Deliberately does
 * NOT consider content height — the window is allowed to shrink below its content.
 */
export function resolveHeightFloor(
  hardMin: number,
  userMinHeight: number,
): number {
  const user = Number.isFinite(userMinHeight) ? Math.floor(userMinHeight) : 0;
  return Math.max(hardMin, user);
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

  // Drag geometry captured once at pointer-down (direction + start height/Y +
  // floor), so a live move is pure arithmetic with no forced layout — the box edge
  // tracks the cursor 1:1. Null when not dragging. Mirrors the horizontal hook.
  let geometry: VerticalResizeGeometry | null = null;
  // rAF coalescing: keep only the latest Y and flush once per animation frame, so
  // a fast pointer never runs the resize math (or a reactive write) more than once
  // per painted frame.
  let pendingY: number | null = null;
  let rafId = 0;

  const resizeStart = (y: number): void =>
    batch(() => {
      setResizing(true);
      const elementRef = untrack(ref);
      const rect = elementRef?.getBoundingClientRect();
      const initialHeight = (state.height || elementRef?.offsetHeight) ?? 0;
      setState({startHeight: initialHeight, startY: y});
      // Grow away from the vertical centre: pulling the bottom handle down or the
      // top handle up both enlarge the box (mirrors the horizontal LTR/RTL logic).
      // Direction is fixed at pointer-down from the handle's side of the centre.
      const middle = rect ? rect.top + rect.height / 2 : y;
      geometry = {
        startHeight: initialHeight,
        startY: y,
        isTop: y < middle,
        // Floor is the user's minHeight (if set), else the sane absolute minimum —
        // NOT the content height, so a drag can shrink the window below its content
        // (CLIP-to-frame), the opposite of width's CLAMP-to-content.
        floor: resolveHeightFloor(options.minHeight, options.userMinHeight()),
        maxHeight: options.maxHeight,
      };
    });

  const resizeMove = (y: number): void => {
    if (!geometry) return;
    setState({height: computeResizeHeight(y, geometry)});
  };

  const queueMove = (y: number): void => {
    pendingY = y;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const y = pendingY;
      pendingY = null;
      if (y != null) resizeMove(y);
    });
  };

  const cancelPendingMove = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    pendingY = null;
  };

  const resizeEnd = (): void => {
    if (!resizing()) return;
    // Flush any pending frame so the committed height equals the last dragged Y.
    if (pendingY != null) resizeMove(pendingY);
    cancelPendingMove();
    geometry = null;
    setResizing(false);
    if (state.height > 0) options.onCommit(Math.round(state.height));
  };

  const onResizeStart = ({clientY}: MouseEvent): void => {
    if (!resizing()) resizeStart(clientY);
  };
  const onMouseMove = ({clientY}: MouseEvent): void => {
    if (resizing()) queueMove(clientY);
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

  onCleanup(cancelPendingMove);

  return {
    ref,
    setRef,
    resizing,
    height: () => state.height,
    onResizeStart,
  };
}
