import type {CustomTheme} from '@codeimage/highlight';
import {getRootEditorStore} from '@codeimage/store/editor';
import {getThemeStore} from '@codeimage/store/theme/theme.store';

/**
 * Resolve the codeimage theme currently applied to the editor. Playback and
 * export both tint their shiki output from this so colors match the editor
 * (problem P2). Returns `undefined` while the theme resource is still loading;
 * callers treat that as "not ready yet" and retry on the next reactive tick.
 */
export function activeCustomTheme(): CustomTheme | undefined {
  const editor = getRootEditorStore();
  const themeStore = getThemeStore();
  const themeId = editor.state.options.themeId;
  const resource = themeStore.getThemeResource(themeId);
  const resolved = resource?.[0]?.();
  if (resolved) return resolved;
  // Fall back to the first loaded theme so a missing/renamed id still tints.
  for (const [theme] of Object.values(themeStore.themeResources)) {
    const value = theme();
    if (value) return value;
  }
  return undefined;
}
