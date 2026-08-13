export type ScreenShareResolution = "720p" | "1080p" | "1440p" | "2160p";
export type ScreenShareFrameRate = 15 | 30 | 60;

export const SCREEN_SHARE_RESOLUTION_DIMENSIONS: Record<
  ScreenShareResolution,
  { width: number; height: number }
> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
};

// What the encoder should protect under congestion. "auto" derives it from the
// preset framerate: 60fps presets are gameplay/video, 30fps presets are
// slides/code where sharp text matters more than smoothness.
export type ScreenShareContentMode = "auto" | "motion" | "detail";

export interface StartScreenCaptureOptions {
  frameRate: ScreenShareFrameRate;
  captureSystemAudio: boolean;
  sourceId?: string;
  resolution?: ScreenShareResolution;
}

export interface ScreenShareStartRequest {
  quality: ScreenShareQualityPreset;
  contentMode: ScreenShareContentMode;
  captureSystemAudio: boolean;
  sourceId: string;
}

export interface StartScreenCaptureResult {
  stream: MediaStream;
  warning?: string;
  sourceName?: string;
}

export type ScreenShareSourceKind = "screen" | "window";
export type ScreenShareQualityPreset =
  | "smooth"
  | "balanced"
  | "high"
  | "sharp"
  | "ultra";

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
