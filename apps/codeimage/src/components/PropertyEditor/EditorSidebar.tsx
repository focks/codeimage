import {DynamicSizedContainer} from '@ui/DynamicSizedContainer/DynamicSizedContainer';
import {EditorStyleForm} from './EditorStyleForm';
import {FrameStyleForm} from './FrameStyleForm';
import {PanelDivider} from './PanelDivider';
import {PlaybackSettingsForm} from './PlaybackSettingsForm';
import {WindowStyleForm} from './WindowStyleForm';

export const EditorSidebar = () => {
  return (
    <>
      <DynamicSizedContainer>
        <FrameStyleForm />
      </DynamicSizedContainer>
      <PanelDivider />

      <DynamicSizedContainer>
        <WindowStyleForm />
      </DynamicSizedContainer>
      <PanelDivider />

      <div>
        <EditorStyleForm />
      </div>
      <PanelDivider />

      <DynamicSizedContainer>
        <PlaybackSettingsForm />
      </DynamicSizedContainer>
    </>
  );
};
