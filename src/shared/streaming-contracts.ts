

export const STREAMING_START_CAPTURE_CHANNEL = "streaming:start-capture";
export const STREAMING_STOP_CAPTURE_CHANNEL = "streaming:stop-capture";


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
}
