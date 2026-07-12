import type {PersistedFrameState} from '@codeimage/store/frame/model';
import type {
  PersistedEditorState,
  PersistedTerminalState,
} from '@codeimage/store/editor/model';

export interface Slide {
  id: string;
  frame: PersistedFrameState;
  terminal: PersistedTerminalState;
  editor: PersistedEditorState;
}

export interface SlidesState {
  slides: Slide[];
  activeSlideIndex: number;
}

export interface PersistedSlidesState {
  $version: string;
  slides: Slide[];
  activeSlideIndex: number;
}

// Keep the IDB key stable so existing decks still load; the frame store coerces
// missing min-width/min-height to 0 (off) when hydrating pre-v2 slide data.
export const SLIDES_IDB_KEY = 'slides$v1';
// v2 adds per-slide frame minWidth/minHeight to PersistedFrameState.
export const SLIDES_VERSION = '2';
