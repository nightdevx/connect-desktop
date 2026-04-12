export const STREAMING_QUALITY_CHANGED_CHANNEL = "quality-changed";
export const STREAMING_QUALITY_PREPARE_CHANNEL = "quality-prepare";
export const STREAMING_ERROR_CHANNEL = "streaming-error";

export const STREAMING_START_CAPTURE_CHANNEL = "streaming:start-capture";
export const STREAMING_STOP_CAPTURE_CHANNEL = "streaming:stop-capture";
export const STREAMING_GET_NETWORK_STATUS_CHANNEL =
  "streaming:get-network-status";
export const STREAMING_SET_MANUAL_QUALITY_CHANNEL =
  "streaming:set-manual-quality";
export const STREAMING_REPORT_BANDWIDTH_CHANNEL = "streaming:report-bandwidth";

export type CaptureType = "screen" | "window" | "game" | "camera";

export type StreamingQualityProfileName =
  | "ULTRA"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "EMERGENCY";

export interface SenderParametersPlan {
  maxBitrateBps: number;
  maxFramerate: number;
}

export interface StreamingQualityProfile {
  name: StreamingQualityProfileName;
  width: number;
  height: number;
  frameRate: number;
  bitrateKbps: number;
  codec: "H264" | "VP8";
  codecProfile: "High" | "Main" | "Baseline" | "";
  keyframeIntervalMs: number;
  senderParameters: SenderParametersPlan;
}

export interface QualityChangeEventPayload {
  profile: StreamingQualityProfile;
  reason: string;
  timestamp: string;
  mode: "auto" | "manual";
  stage?: "prepare" | "commit";
}

export type QualityProfile = StreamingQualityProfile;

export interface BandwidthEstimatePayload {
  roomId: string;
  source: "camera" | "screen";
  profile: StreamingQualityProfileName;
  bitrateBps: number;
  packetsLost: number;
  packetsSent: number;
  rttMs: number;
  timestamp: string;
}

export interface NetworkStats {
  score: number;
  rttMs: number;
  packetLossPercent: number;
  bandwidthKbps: number;
  jitterMs: number;
  quality: "good" | "medium" | "poor";
  probeMode: "normal" | "degraded";
  activeProfile: StreamingQualityProfileName;
  manualProfile: StreamingQualityProfileName | null;
  updatedAt: string;
}

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
  onQualityChange: (
    listener: (event: QualityChangeEventPayload) => void,
  ) => () => void;
  getNetworkStatus: () => Promise<NetworkStats>;
  setManualQuality: (
    profile: StreamingQualityProfileName | null,
  ) => Promise<StreamingQualityProfile | null>;
  reportBandwidthEstimate: (payload: BandwidthEstimatePayload) => Promise<void>;
}
