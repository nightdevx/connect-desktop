

export const STREAMING_START_CAPTURE_CHANNEL = "streaming:start-capture";
export const STREAMING_STOP_CAPTURE_CHANNEL = "streaming:stop-capture";

// Process-exclude system-audio loopback (Windows). Captures system audio minus
// this app's own output so screen-share audio never echoes remote voices.
export const STREAMING_LOOPBACK_START_CHANNEL = "streaming:loopback-start";
export const STREAMING_LOOPBACK_STOP_CHANNEL = "streaming:loopback-stop";
export const STREAMING_LOOPBACK_PCM_CHANNEL = "streaming:loopback-pcm";

export interface LoopbackStartResult {
  ok: boolean;
  sampleRate?: number;
  channels?: number;
  error?: string;
}


export type CaptureType = "screen" | "window" | "game" | "camera";

export interface SenderParametersPlan {
  maxBitrateBps: number;
  maxFramerate: number;
}

export interface StreamingQualityProfile {
  name: string;
  width: number;
  height: number;
  frameRate: number;
  bitrateKbps: number;
  codec: "H264" | "VP8";
  codecProfile: "High" | "Main" | "Baseline" | "";
  keyframeIntervalMs: number;
  senderParameters: SenderParametersPlan;
}

export type QualityProfile = StreamingQualityProfile;

export interface StartCaptureRequest {
  sourceId?: string;
  type: CaptureType;
}

export interface CaptureEncoderPlan {
  preferHardwareEncoder: boolean;
  hardwareEncoder: "NVENC" | "QuickSync" | "Software";
  cpuEncoderThreads: number;
}

export interface CapturePlan {
  width: number;
  height: number;
  frameRate: number;
  pipCapable: boolean;
  gameModeActive: boolean;
  encoder: CaptureEncoderPlan;
}

export interface StartCaptureResult {
  sessionId: string;
  sourceId: string | null;
  sourceName: string;
  requestedType: CaptureType;
  effectiveType: CaptureType;
  gameDetected: boolean;
  plan: CapturePlan;
}

export interface StopCaptureResult {
  stopped: boolean;
  stoppedSessions: string[];
}

export interface StreamingApi {
  startCapture: (
    sourceId: string | undefined,
    type: CaptureType,
  ) => Promise<StartCaptureResult>;
  stopCapture: () => Promise<StopCaptureResult>;
  startSystemAudioLoopback: () => Promise<LoopbackStartResult>;
  stopSystemAudioLoopback: () => Promise<void>;
  // Streams interleaved Float32 PCM frames (stereo @ reported sampleRate).
  onSystemAudioPcm: (listener: (samples: Float32Array) => void) => () => void;
}
