/**
 * WebCodecs -> mp4-muxer encoder wiring. Owns codec selection, encoder config,
 * chunk muxing and finalization. Knows nothing about slides, playback or the
 * DOM — it consumes VideoFrames and produces an MP4 Blob.
 */

import {ArrayBufferTarget, Muxer} from 'mp4-muxer';
import {frameDurationMicros, targetBitrate} from './videoExportMath';

/** Codecs mp4-muxer can package, in preference order (best compatibility first). */
type MuxerCodec = 'avc' | 'vp9';

interface CodecChoice {
  /** WebCodecs codec string for VideoEncoder.configure. */
  readonly encoderCodec: string;
  /** mp4-muxer codec tag. */
  readonly muxerCodec: MuxerCodec;
}

/**
 * Pick an AVC (H.264) level appropriate for the resolution, then fall back to
 * VP9. AVC level strings encode a max resolution/bitrate tier; we bump the level
 * with pixel count so large canvases still validate.
 */
function avcCodecString(width: number, height: number): string {
  const mbPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  // Level hex: 3.0=1e, 3.1=1f, 4.0=28, 4.2=2a, 5.0=32, 5.1=33, 5.2=34.
  let levelHex = '1f'; // 3.1 — safe for up to ~720p30
  if (mbPerFrame > 8160) levelHex = '34'; // 5.2 — up to 4K
  else if (mbPerFrame > 3600) levelHex = '2a'; // 4.2 — up to ~1080p
  else if (mbPerFrame > 1620) levelHex = '28'; // 4.0
  // Constrained Baseline (42) with the chosen level.
  return `avc1.4200${levelHex}`;
}

/**
 * Resolve a supported codec for the given dimensions. Tries AVC first, then VP9.
 * Throws a user-facing error if neither is available in this browser.
 */
export async function selectCodec(
  width: number,
  height: number,
  fps: number,
): Promise<CodecChoice> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'Video export is not supported in this browser (WebCodecs unavailable).',
    );
  }

  const bitrate = targetBitrate(width, height, fps);
  const candidates: readonly CodecChoice[] = [
    {encoderCodec: avcCodecString(width, height), muxerCodec: 'avc'},
    {encoderCodec: 'vp09.00.10.08', muxerCodec: 'vp9'},
  ];

  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.encoderCodec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) return candidate;
    } catch {
      /* try the next candidate */
    }
  }

  throw new Error(
    'No supported video codec (AVC or VP9) found for this resolution.',
  );
}

export interface Mp4Recorder {
  /** Encode a single VideoFrame. The caller must close the frame afterwards. */
  encode(frame: VideoFrame, isKeyFrame: boolean): void;
  /** Flush the encoder, finalize the muxer and return the MP4 Blob. */
  finish(): Promise<Blob>;
  /** Codec actually chosen for this recording (for reporting/telemetry). */
  readonly muxerCodec: MuxerCodec;
}

/**
 * Build an MP4 recorder for a fixed resolution/fps. Encoder errors are captured
 * and surfaced from `finish()` so the caller's `finally` can still run cleanup.
 */
export async function createMp4Recorder(
  width: number,
  height: number,
  fps: number,
): Promise<Mp4Recorder> {
  const codec = await selectCodec(width, height, fps);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {codec: codec.muxerCodec, width, height},
    fastStart: 'in-memory',
  });

  let encodeError: DOMException | Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: err => {
      encodeError = err;
    },
  });

  encoder.configure({
    codec: codec.encoderCodec,
    width,
    height,
    bitrate: targetBitrate(width, height, fps),
    framerate: fps,
  });

  return {
    muxerCodec: codec.muxerCodec,
    encode(frame, isKeyFrame) {
      if (encodeError) return; // stop feeding a dead encoder
      encoder.encode(frame, {keyFrame: isKeyFrame});
    },
    async finish() {
      await encoder.flush();
      encoder.close();
      if (encodeError) throw encodeError;

      muxer.finalize();
      const {buffer} = muxer.target;
      return new Blob([buffer], {type: 'video/mp4'});
    },
  };
}

/** Re-exported for callers that build VideoFrames with matching durations. */
export {frameDurationMicros};
