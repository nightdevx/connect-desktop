// Process-exclude system-audio loopback (Windows). Captures system audio minus
// this app's own output so screen-share audio never echoes remote voices.
//
// The screen/camera capture planning contracts that used to live here are gone:
// the renderer captures directly via getUserMedia with chromeMediaSource, and
// the main-process CaptureEngine that produced "capture plans" was never wired
// to anything — its game detection and encoder plan were computed and dropped.
export const STREAMING_LOOPBACK_START_CHANNEL = "streaming:loopback-start";
export const STREAMING_LOOPBACK_STOP_CHANNEL = "streaming:loopback-stop";
export const STREAMING_LOOPBACK_PCM_CHANNEL = "streaming:loopback-pcm";

export interface LoopbackStartResult {
  ok: boolean;
  sampleRate?: number;
  channels?: number;
  error?: string;
}

export interface StreamingApi {
  startSystemAudioLoopback: () => Promise<LoopbackStartResult>;
  stopSystemAudioLoopback: () => Promise<void>;
  // Streams interleaved Float32 PCM frames (stereo @ reported sampleRate).
  onSystemAudioPcm: (listener: (samples: Float32Array) => void) => () => void;
}
