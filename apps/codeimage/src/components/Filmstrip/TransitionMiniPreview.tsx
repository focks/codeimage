import type {EntryMode} from '@codeimage/store/playback/timeline';
import {clsx} from 'clsx';
import {For, Match, Switch} from 'solid-js';
import * as styles from './TransitionChip.css';

/**
 * A tiny (~58×34) stylized code-block mock that runs the given transition as a
 * looped, pure-CSS animation ON HOVER of its parent option card (Canva behavior),
 * and sits static otherwise. Three faux "code" bars are enough to convey the
 * motion; no real highlighter runs here, keeping it cheap.
 */
export function TransitionMiniPreview(props: {mode: EntryMode}) {
  return (
    <div class={styles.previewBox} style={{color: '#a6adc8'}} aria-hidden={'true'}>
      <Switch>
        <Match when={props.mode === 'fade'}>
          <For each={[70, 52, 60]}>
            {(w, i) => (
              <div
                class={clsx(
                  styles.previewBar,
                  styles.barFade,
                  i() === 1 && styles.barDelay1,
                  i() === 2 && styles.barDelay2,
                )}
                style={{width: `${w}%`}}
              />
            )}
          </For>
        </Match>

        <Match when={props.mode === 'slide'}>
          <For each={[70, 52, 60]}>
            {(w, i) => (
              <div
                class={clsx(
                  styles.previewBar,
                  styles.barSlide,
                  i() === 1 && styles.barDelay1,
                  i() === 2 && styles.barDelay2,
                )}
                style={{width: `${w}%`}}
              />
            )}
          </For>
        </Match>

        <Match when={props.mode === 'morph'}>
          <For each={[70, 52, 60]}>
            {(w, i) => (
              <div
                class={clsx(
                  styles.previewBar,
                  styles.barMorph,
                  i() === 1 && styles.barDelay1,
                  i() === 2 && styles.barDelay2,
                )}
                style={{width: `${w}%`}}
              />
            )}
          </For>
        </Match>

        <Match when={props.mode === 'typewriter'}>
          <For each={[70, 52, 60]}>
            {(w, i) => (
              <div
                class={clsx(
                  styles.previewBar,
                  styles.barType,
                  i() === 1 && styles.barDelay1,
                  i() === 2 && styles.barDelay2,
                )}
                style={{'max-width': `${w}%`, width: '100%'}}
              />
            )}
          </For>
        </Match>

        {/* none: a hard cut — bars just swap opacity halfway. */}
        <Match when={props.mode === 'none'}>
          <For each={[70, 52, 60]}>
            {w => (
              <div
                class={clsx(styles.previewBar, styles.barNone)}
                style={{width: `${w}%`}}
              />
            )}
          </For>
        </Match>
      </Switch>
    </div>
  );
}
