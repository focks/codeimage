import {getPlaybackStore} from '@codeimage/store/playback/playbackStore';
import {
  startPlayback,
  stopPlayback,
} from '@codeimage/store/playback/playbackController';
import {getSlidesStore} from '@codeimage/store/slides';
import {SvgIcon, type SvgIconProps} from '@codeimage/ui';
import {Button} from '@codeui/kit';
import {useModality} from '@core/hooks/isMobile';
import {onCleanup, onMount} from 'solid-js';

// Filmstrip uses plain strings rather than i18n; the play toggle follows suit to
// avoid threading four-locale keys for a single button. Labels are English-only.

const PlayIcon = (props: SvgIconProps) => (
  <SvgIcon fill="currentColor" viewBox="0 0 24 24" {...props}>
    <path d="M8 5v14l11-7z" />
  </SvgIcon>
);

const StopIcon = (props: SvgIconProps) => (
  <SvgIcon fill="currentColor" viewBox="0 0 24 24" {...props}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </SvgIcon>
);

/**
 * Toggles fullcanvas playback. Play starts from slide 1; the button becomes Stop
 * while playing. Escape also stops. On stop/finish the controller restores the
 * user's pre-playback active slide and live-store state exactly.
 */
export function PlayButton() {
  const modality = useModality();
  const playback = getPlaybackStore();
  const slidesStore = getSlidesStore();

  const size = () => (modality === 'full' ? 'sm' : 'xs');
  const canPlay = () => slidesStore.state.slides.length > 0;

  const toggle = () => {
    if (playback.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && playback.isPlaying) {
        event.preventDefault();
        stopPlayback();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Button
      theme={playback.isPlaying ? 'negative' : 'secondary'}
      size={size()}
      disabled={!canPlay()}
      leftIcon={playback.isPlaying ? <StopIcon /> : <PlayIcon />}
      onClick={toggle}
      aria-label={playback.isPlaying ? 'Stop playback' : 'Play slides'}
    >
      {playback.isPlaying ? 'Stop' : 'Play'}
    </Button>
  );
}
