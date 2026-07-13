import type {Slide} from '@codeimage/store/slides/model';
import {createMemo, For, Show} from 'solid-js';
import * as styles from './SlideThumbnail.css';

interface SlideThumbnailProps {
  slide: Slide;
}

// macOS traffic-light colors — kept literal so the thumbnail is fully
// self-contained and never pulls in the heavy Terminal render tree.
const TRAFFIC_LIGHTS = ['#ff5f56', '#ffbd2e', '#27c93f'] as const;

// How many code lines the mini preview shows before it clips. Enough to convey
// the shape of the snippet without overflowing the tiny window body.
const MAX_LINES = 9;
const MAX_LINE_CHARS = 42;

// Card box size the stage is scaled into. Exported so the Filmstrip card CSS and
// the thumbnail scale stay in lockstep (STAGE_WIDTH * scale === THUMB_CARD_WIDTH).
export const THUMB_CARD_WIDTH = 96;
export const THUMB_CARD_HEIGHT = 60;

/**
 * A self-contained, non-interactive miniature of a slide: the frame background,
 * a window with traffic-light dots, and the first editor's code as plain
 * monospace text. Rendered at a virtual size then shrunk with a CSS transform so
 * the tiny text stays crisp. Reactive — re-renders when the slide's data changes
 * (e.g. the active slide's code being edited flushes back into the store).
 */
export function SlideThumbnail(props: SlideThumbnailProps) {
  const backdropBackground = createMemo(
    () => props.slide.frame.background ?? '#1e1e2e',
  );

  const windowBackground = createMemo(
    () => props.slide.terminal.background ?? '#1e1e2e',
  );

  const textColor = createMemo(
    () => props.slide.terminal.textColor ?? 'rgba(255, 255, 255, 0.85)',
  );

  const showHeader = createMemo(() => props.slide.terminal.showHeader);

  // First editor's code, split into a bounded set of trimmed lines. Blank lines
  // are kept so indentation shape reads correctly; each line is length-capped so
  // one very long line can't blow out the window width.
  const lines = createMemo<string[]>(() => {
    const code = props.slide.editor.editors[0]?.code ?? '';
    return code
      .split('\n')
      .slice(0, MAX_LINES)
      .map(line =>
        line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) : line,
      );
  });

  const hasCode = createMemo(() =>
    lines().some(line => line.trim().length > 0),
  );

  return (
    <div class={styles.thumbnail} aria-hidden={'true'}>
      <div
        class={styles.stage}
        style={{
          // Shrink the 320x200 virtual stage to exactly the 96x60 card box
          // (320 * 0.3 = 96, 200 * 0.3 = 60). Fixed sizes keep this deterministic.
          transform: `scale(${THUMB_CARD_WIDTH / styles.STAGE_WIDTH})`,
        }}
      >
        <div
          class={styles.backdrop}
          style={{background: backdropBackground()}}
        />
        <div class={styles.window} style={{background: windowBackground()}}>
          <Show when={showHeader()}>
            <div class={styles.header}>
              <For each={TRAFFIC_LIGHTS}>
                {color => (
                  <div class={styles.dot} style={{background: color}} />
                )}
              </For>
            </div>
          </Show>
          <div class={styles.codeArea}>
            <Show
              when={hasCode()}
              fallback={
                <For each={[70, 55, 62, 40]}>
                  {width => (
                    <div class={styles.emptyBar} style={{width: `${width}%`}} />
                  )}
                </For>
              }
            >
              <For each={lines()}>
                {line => (
                  <div class={styles.codeLine} style={{color: textColor()}}>
                    {line.length === 0 ? ' ' : line}
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
