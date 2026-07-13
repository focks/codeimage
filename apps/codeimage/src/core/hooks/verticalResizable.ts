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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (max > 0 && value > max) return max;
  return value;
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
    // Floor is the user's minHeight (if set), else the sane absolute minimum — NOT
    // the content height. Dragging up therefore shrinks the window below its
    // natural content and the code clips at the bottom (CLIP-to-frame choice), the
    // opposite of width which clamps to `max-content` so the code never wraps.
    const floor = resolveHeightFloor(
      options.minHeight,
      options.userMinHeight(),
    );
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
