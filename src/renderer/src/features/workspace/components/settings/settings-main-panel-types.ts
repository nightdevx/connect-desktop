export interface CameraPreferences {
  resolution: "720p" | "1080p";
  frameRate: 24 | 30;
}

export type NoiseSuppressionPreset = "natural" | "balanced" | "aggressive";

export interface AudioPreferences {
  defaultMicEnabled: boolean;
  defaultHeadphoneEnabled: boolean;
  notificationSoundsEnabled: boolean;
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
}

export interface StreamPreferences {
  frameRate: 15 | 30 | 60;
  captureSystemAudio: boolean;
}
