import {getExportCanvasStore} from '@codeimage/store/canvas';
import {buildTimelineFromSlides} from '@codeimage/store/playback/playbackController';
import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {getSlidesStore} from '@codeimage/store/slides';
import type {SegmentedFieldItem} from '@codeimage/ui';
import {
  FieldLabel,
  FieldLabelHint,
  FlexField,
  HStack,
  Text,
  toast,
  VStack,
} from '@codeimage/ui';
import {Button, Dialog, DialogPanelContent, DialogPanelFooter} from '@codeui/kit';
import {useModality} from '@core/hooks/isMobile';
import {SegmentedField} from '@ui/SegmentedField/SegmentedField';
import {createMemo, createSignal, Show} from 'solid-js';
import {type ExportFormat, exportVideo} from '../../export-video/exportVideo';
import {GIF_MAX_FPS} from '../../export-video/gifHelpers';
import {wouldExceedLimit} from '../../export-video/scaleHelpers';
import {FilmIcon} from '../Icons/Film';
import * as styles from './ExportVideoDialog.css';

interface ExportVideoButtonProps {
  /** Same node ExportButton receives — the frame wrapper element. */
  canvasRef: HTMLElement | undefined;
}

/** Human-readable seconds from a duration in ms. */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExportVideoButton(props: ExportVideoButtonProps) {
  const modality = useModality();
  const playback = getPlaybackStore();
  const slidesStore = getSlidesStore();
  const [open, setOpen] = createSignal(false);

  const buttonSize = () => (modality === 'full' ? 'sm' : 'xs');
  const slideCount = () => slidesStore.state.slides.length;
  const disabled = () => slideCount() < 1 || playback.isPlaying;

  return (
    <>
      <Button
        theme={'secondary'}
        size={buttonSize()}
        disabled={disabled()}
        leftIcon={<FilmIcon />}
        onClick={() => setOpen(true)}
        aria-label={'Export video'}
      >
        Video
      </Button>

      <ExportVideoDialog
        open={open()}
        onOpenChange={setOpen}
        canvasRef={props.canvasRef}
        size={modality === 'mobile' ? 'full' : 'md'}
      />
    </>
  );
}

interface ExportVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasRef: HTMLElement | undefined;
  size: 'full' | 'md';
}

function ExportVideoDialog(props: ExportVideoDialogProps) {
  const exportCanvasStore = getExportCanvasStore();
  const [pixelRatio, setPixelRatio] = createSignal<number>(1);
  const [fps, setFps] = createSignal<number>(30);
  const [format, setFormat] = createSignal<ExportFormat>('mp4');
  const [exporting, setExporting] = createSignal(false);
  const [progress, setProgress] = createSignal({done: 0, total: 0});

  // Recomputed each render; cheap and always reflects the current slides.
  const durationMs = createMemo(
    () => buildTimelineFromSlides().totalDurationMs,
  );

  // Clamp warning: show when selected scale would exceed 4096 px on any axis.
  const scaleWouldClamp = createMemo(() => {
    const node = props.canvasRef;
    if (!node) return false;
    const {width, height} = node.getBoundingClientRect();
    return wouldExceedLimit(width, height, pixelRatio());
  });

  // GIF forces fps to its max; MP4 uses the user's choice.
  const effectiveFps = createMemo(() =>
    format() === 'gif' ? GIF_MAX_FPS : fps(),
  );

  const pixelRatioItems: SegmentedFieldItem<number>[] = [
    {label: '1x', value: 1},
    {label: '2x', value: 2},
    {label: '4x', value: 4},
  ];

  const fpsItems: SegmentedFieldItem<number>[] = [
    {label: '30 fps', value: 30},
    {label: '60 fps', value: 60},
  ];

  const formatItems: SegmentedFieldItem<ExportFormat>[] = [
    {label: 'MP4', value: 'mp4'},
    {label: 'GIF', value: 'gif'},
  ];

  const percent = () => {
    const {done, total} = progress();
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  // A mutable cancel flag polled by the export loop's isCancelled callback.
  let cancelled = false;

  const close = () => {
    if (exporting()) return; // don't close mid-export; use Cancel first
    props.onOpenChange(false);
  };

  const cancel = () => {
    cancelled = true;
  };

  const startExport = async () => {
    // Video export must snapshot the LIVE on-canvas frame — the subtree that
    // swaps in AnimationView (typing/morph) during playback — not the static
    // Portal-mounted PreviewFrame used for image export.
    const node = exportCanvasStore.get.liveFrameRef;
    if (!node) {
      toast.error('Nothing to export.', {position: 'bottom-center'});
      return;
    }

    cancelled = false;
    setExporting(true);
    setProgress({done: 0, total: 0});

    try {
      const result = await exportVideo({
        node,
        pixelRatio: pixelRatio(),
        fps: effectiveFps(),
        format: format(),
        onProgress: (done, total) => setProgress({done, total}),
        isCancelled: () => cancelled,
        fileName: 'codeimage',
      });

      if (result.cancelled) {
        toast.success('Export cancelled.', {position: 'bottom-center'});
      } else {
        toast.success(
          format() === 'gif' ? 'GIF exported.' : 'Video exported.',
          {position: 'bottom-center'},
        );
        props.onOpenChange(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Export failed.';
      toast.error(message, {position: 'bottom-center'});
    } finally {
      setExporting(false);
      setProgress({done: 0, total: 0});
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={close}
      modal={true}
      size={props.size}
      title={'Export video'}
    >
      <DialogPanelContent>
        <VStack spacing={'6'}>
          <FlexField size={'md'}>
            <FieldLabel size={'sm'}>Format</FieldLabel>
            <SegmentedField
              autoWidth
              size={'md'}
              value={format()}
              onChange={setFormat}
              items={formatItems}
            />
          </FlexField>

          <FlexField size={'md'}>
            <FieldLabel size={'sm'}>Frame rate</FieldLabel>
            <Show
              when={format() !== 'gif'}
              fallback={
                <FieldLabelHint>
                  {GIF_MAX_FPS} fps — locked for GIF
                </FieldLabelHint>
              }
            >
              <SegmentedField
                autoWidth
                size={'md'}
                value={fps()}
                onChange={setFps}
                items={fpsItems}
              />
            </Show>
          </FlexField>

          <FlexField size={'md'}>
            <FieldLabel size={'sm'}>Resolution</FieldLabel>
            <SegmentedField
              autoWidth
              size={'md'}
              value={pixelRatio()}
              onChange={setPixelRatio}
              items={pixelRatioItems}
            />
            <Show when={scaleWouldClamp()}>
              <FieldLabelHint>Clamped to 4096 px limit</FieldLabelHint>
            </Show>
          </FlexField>

          <FlexField size={'md'}>
            <div class={styles.summaryRow}>
              <FieldLabel size={'sm'}>Duration</FieldLabel>
              <FieldLabelHint>{formatDuration(durationMs())}</FieldLabelHint>
            </div>
          </FlexField>

          <Show when={exporting()}>
            <VStack spacing={'2'}>
              <div class={styles.summaryRow}>
                <Text size={'sm'}>Rendering…</Text>
                <FieldLabelHint>
                  {progress().done} / {progress().total} frames
                </FieldLabelHint>
              </div>
              <div class={styles.progressTrack}>
                <div
                  class={styles.progressFill}
                  style={{width: `${percent()}%`}}
                />
              </div>
            </VStack>
          </Show>
        </VStack>
      </DialogPanelContent>
      <DialogPanelFooter>
        <HStack spacing={'2'} justifyContent={'flexEnd'}>
          <Show
            when={exporting()}
            fallback={
              <>
                <Button
                  block
                  size={'md'}
                  theme={'secondary'}
                  onClick={close}
                >
                  Close
                </Button>
                <Button
                  block
                  size={'md'}
                  theme={'primary'}
                  onClick={startExport}
                >
                  Export
                </Button>
              </>
            }
          >
            <Button block size={'md'} theme={'negative'} onClick={cancel}>
              Cancel
            </Button>
          </Show>
        </HStack>
      </DialogPanelFooter>
    </Dialog>
  );
}
