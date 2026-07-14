import type {PersistedFrameState} from '@codeimage/store/frame/model';

/** Default code font size in px when no user/persisted value exists. */
export const DEFAULT_FONT_SIZE = 16;
/** Inclusive font-size bounds for the editor code (UI + stored value). */
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 28;

/** Clamp a (possibly missing/invalid) font size into the supported range. */
export function clampFontSize(value: number | undefined | null): number {
  if (value == null || Number.isNaN(value)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export interface EditorUIOptions {
  fontId: string;
  fontWeight: number;
  showLineNumbers: boolean;
  focused: boolean;
  themeId: string;
}

export interface TabState {
  tabName: string | null;
  tabIcon?: string;
}

export interface EditorState {
  id: string;
  code: string;
  tab: TabState;
  formatter?: string | null;
  languageId: string;
  lineNumberStart: number;
}

export interface EditorUIOptions {
  fontId: string;
  fontWeight: number;
  showLineNumbers: boolean;
  focused: boolean;
  themeId: string;
  enableLigatures: boolean;
  /** Code font size in px. Absent in pre-fontSize data -> defaults to 16. */
  fontSize: number;
}

export interface PersistedEditorState {
  readonly options: Omit<EditorUIOptions, 'focused'>;
  readonly editors: {
    id: string;
    code: string;
    tabName: string;
    languageId: string;
    lineNumberStart: number;
  }[];
}

export interface TerminalState {
  showHeader: boolean;
  type: string;
  accentVisible: boolean;
  shadow: string | null;
  background: string;
  textColor: string;
  showWatermark: boolean;
  showGlassReflection: boolean;
  opacity: number;
  alternativeTheme: boolean;
  // eslint-disable-next-line @typescript-eslint/ban-types
  borderType: ('glass' | (string & {})) | null;
}

export type PersistedTerminalState = Pick<
  TerminalState,
  | 'showHeader'
  | 'type'
  | 'accentVisible'
  | 'shadow'
  | 'background'
  | 'textColor'
  | 'showWatermark'
  | 'showGlassReflection'
  | 'opacity'
  | 'alternativeTheme'
  | 'borderType'
>;

export interface ProjectEditorPersistedState {
  $snippetId: string | null;
  $version: string;
  frame: PersistedFrameState;
  terminal: PersistedTerminalState;
  editor: PersistedEditorState;
}
