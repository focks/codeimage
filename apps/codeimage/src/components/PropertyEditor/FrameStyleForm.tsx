import {useI18n} from '@codeimage/locale';
import {getFrameState} from '@codeimage/store/editor/frame';
import {
  MAX_FRAME_MIN_HEIGHT,
  MAX_FRAME_MIN_WIDTH,
  MIN_FRAME_SIZE,
} from '@codeimage/store/frame/model';
import {RangeField} from '@codeimage/ui';
import {getUmami} from '@core/constants/umami';
import {SegmentedField} from '@ui/SegmentedField/SegmentedField';
import {SkeletonLine, SkeletonVCenter} from '@ui/Skeleton/Skeleton';
import type {ParentComponent} from 'solid-js';
import {Show} from 'solid-js';
import {appEnvironment} from '../../core/configuration';
import type {AppLocaleEntries} from '../../i18n';
import {AspectRatioPicker} from './controls/AspectRatioPicker/AspectRatioPicker';
import {CustomColorPicker} from './controls/ColorPicker/CustomColorPicker';
import {PanelHeader} from './PanelHeader';
import {PanelRow, TwoColumnPanelRow} from './PanelRow';
import {SuspenseEditorItem} from './SuspenseEditorItem';
import {NumberField, Select, createSelectOptions} from '@codeui/kit';

export const FrameStyleForm: ParentComponent = () => {
  const [t] = useI18n<AppLocaleEntries>();
  const {editorPadding, editorRadius} = appEnvironment;
  const frame = getFrameState();

  const paddingOptions = createSelectOptions(
    editorPadding.map(padding => ({
      label: padding.label,
      value: padding.value,
    })),
    {
      key: 'label',
      valueKey: 'value',
    },
  );

  // NumberField emits number | null | undefined; drop nullish before dispatch.
  // The store clamps the value; 0 disables the minimum-size floor.
  const onNumber = (fn: (value: number) => void) => (value?: number | null) => {
    if (typeof value === 'number' && !Number.isNaN(value)) fn(value);
  };

  return (
    <>
      <PanelHeader label={t('frame.frame')} />

      <PanelRow for={'paddingField'} label={t('frame.padding')}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            {/* @ts-expect-error Fix @codeui/kit types */}
            <Select
              disallowEmptySelection
              {...paddingOptions.props()}
              {...paddingOptions.controlled(
                () => String(frame.store.padding),
                padding => {
                  if (typeof padding === 'undefined') {
                    return;
                  }
                  frame.setPadding(Number(padding));
                },
              )}
              options={paddingOptions.options()}
              aria-label={'Padding'}
              id={'paddingField'}
              size={'xs'}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'radiusField'} label={t('frame.radius')}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            <SegmentedField
              adapt
              id={'radiusField'}
              size={'xs'}
              value={frame.store.radius}
              onChange={frame.setRadius}
              items={editorRadius.map(padding => ({
                label: padding.label,
                value: padding.value,
              }))}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'visibleField'} label={t('frame.visible')}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            <SegmentedField
              adapt
              id={'visibleField'}
              size={'xs'}
              value={frame.store.visible}
              onChange={frame.setVisibility}
              items={[
                {label: t('common.yes'), value: true},
                {label: t('common.no'), value: false},
              ]}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>

      <Show when={frame.store.visible}>
        <PanelRow for={'opacityField'} label={t('frame.opacity')}>
          <TwoColumnPanelRow>
            <SuspenseEditorItem
              fallback={
                <SkeletonVCenter>
                  <SkeletonLine width={'100%'} height={'24px'} />
                </SkeletonVCenter>
              }
            >
              <RangeField
                id={'opacityField'}
                value={frame.store.opacity}
                min={0}
                disabled={!frame.store.visible}
                max={100}
                onChange={frame.setOpacity}
              />
            </SuspenseEditorItem>
          </TwoColumnPanelRow>
        </PanelRow>
      </Show>

      <Show when={frame.store.visible}>
        <PanelRow for={'colorField'} label={t('frame.background')}>
          <TwoColumnPanelRow>
            <SuspenseEditorItem
              fallback={<SkeletonLine width={'100%'} height={'26px'} />}
            >
              <CustomColorPicker
                onChange={frame.setBackground}
                value={frame.store.background ?? ''}
              />
            </SuspenseEditorItem>
          </TwoColumnPanelRow>
        </PanelRow>
      </Show>

      <PanelRow for={'aspectRatio'} label={t('frame.aspectRatio')}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            <AspectRatioPicker
              value={frame.store.aspectRatio}
              onChange={ratio => {
                frame.setAspectRatio(ratio);
                getUmami().track('aspect-ratio', {ratio: ratio ?? 'unset'});
              }}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'minWidthField'} label={'Min width (px)'}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            <NumberField
              size={'xs'}
              id={'minWidthField'}
              min={MIN_FRAME_SIZE}
              max={MAX_FRAME_MIN_WIDTH}
              step={10}
              value={frame.store.minWidth}
              onChange={onNumber(frame.setMinWidth)}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>

      <PanelRow for={'minHeightField'} label={'Min height (px)'}>
        <TwoColumnPanelRow>
          <SuspenseEditorItem
            fallback={<SkeletonLine width={'100%'} height={'26px'} />}
          >
            <NumberField
              size={'xs'}
              id={'minHeightField'}
              min={MIN_FRAME_SIZE}
              max={MAX_FRAME_MIN_HEIGHT}
              step={10}
              value={frame.store.minHeight}
              onChange={onNumber(frame.setMinHeight)}
            />
          </SuspenseEditorItem>
        </TwoColumnPanelRow>
      </PanelRow>
    </>
  );
};
