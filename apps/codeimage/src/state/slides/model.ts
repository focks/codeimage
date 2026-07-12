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

export const SLIDES_IDB_KEY = 'slides$v1';
export const SLIDES_VERSION = '1';
