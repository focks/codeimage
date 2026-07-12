import {getRootEditorStore} from '@codeimage/store/editor';
import {getActiveEditorStore} from '@codeimage/store/editor/activeEditor';
import {getEditorSyncAdapter} from '@codeimage/store/editor/createEditorSync';
import {getFrameState} from '@codeimage/store/editor/frame';
import {getTerminalState} from '@codeimage/store/editor/terminal';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {lazy, Show} from 'solid-js';
import {AnimationView} from '../AnimationView/AnimationView';
import {DynamicTerminal} from '../Terminal/DynamicTerminal/DynamicTerminal';
import {Frame} from './Frame';

const CanvasEditor = lazy(() => import('../CustomEditor/CanvasEditor'));

export function ManagedFrame() {
  const frame = getFrameState().store;
  const terminal = getTerminalState().state;
  const editor = getRootEditorStore();
  const playback = getPlaybackStore();
  const {readOnly} = getEditorSyncAdapter()!;

  return (
    <Frame
      readOnly={readOnly()}
      radius={frame.radius ?? 0}
      padding={frame.padding}
      background={frame.background}
      opacity={frame.opacity}
      visible={frame.visible}
      minWidth={frame.minWidth}
      minHeight={frame.minHeight}
      aspectRatio={frame.aspectRatio}
      onWidthChange={getFrameState().setWidth}
      onHeightChange={getFrameState().setHeight}
    >
      <DynamicTerminal
        type={terminal.type}
        readonlyTab={readOnly()}
        showTab={true}
        shadow={terminal.shadow}
        background={terminal.background}
        accentVisible={terminal.accentVisible}
        textColor={terminal.textColor}
        showHeader={terminal.showHeader}
        showGlassReflection={terminal.showGlassReflection}
        showWatermark={terminal.showWatermark}
        opacity={terminal.opacity}
        alternativeTheme={terminal.alternativeTheme}
        borderType={terminal.borderType}
        themeId={editor.state.options.themeId}
      >
        <Show
          when={!playback.isPlaying}
          fallback={<AnimationView />}
        >
          <Show when={getActiveEditorStore().editor()}>
            <CanvasEditor readOnly={readOnly()} />
          </Show>
        </Show>
      </DynamicTerminal>
    </Frame>
  );
}
