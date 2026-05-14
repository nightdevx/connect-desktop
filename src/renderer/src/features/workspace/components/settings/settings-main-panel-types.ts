export interface CameraPreferences {
  resolution: "720p" | "1080p";
  frameRate: 24 | 30;
}

import { type NoiseSuppressionPreset } from "@/features/rnnoise";

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


