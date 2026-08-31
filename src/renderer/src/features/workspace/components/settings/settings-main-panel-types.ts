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
  echoCancellationEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  masterVolume: number;
  microphoneVolume: number;
}

import { type VideoCodecPreference } from "@/features/livekit";

export interface StreamPreferences {
  frameRate: 15 | 30 | 60;
  captureSystemAudio: boolean;
  // "auto" picks H.264 when hardware encoding is on (broadest GPU support on
  // Windows) and VP8 when it is off. Overriding is for troubleshooting.
  videoCodec: VideoCodecPreference;
}
