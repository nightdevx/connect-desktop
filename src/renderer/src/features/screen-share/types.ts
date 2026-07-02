export type ScreenShareResolution = "720p" | "1080p" | "1440p";
export type ScreenShareFrameRate = 15 | 30 | 60;

export interface StartScreenCaptureOptions {
  frameRate: ScreenShareFrameRate;
  captureSystemAudio: boolean;
  sourceId?: string;
  resolution?: ScreenShareResolution;
}

export interface StartScreenCaptureResult {
  stream: MediaStream;
  warning?: string;
  sourceName?: string;
}

export type ScreenShareSourceKind = "screen" | "window";
export type ScreenShareQualityPreset = "smooth" | "balanced" | "sharp";

export interface ScreenShareQualityOption {
  id: ScreenShareQualityPreset;
  label: string;
  description: string;
  frameRate: ScreenShareFrameRate;
  resolution: ScreenShareResolution;
  // Target publish bitrate (bps) for the selected preset. Threaded into the
  // LiveKit encoder so the chosen quality is actually delivered.
  maxBitrateBps: number;
}
