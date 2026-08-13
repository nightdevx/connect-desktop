import type {
  LiveKitAudioProcessingPreferences,
} from "./types";

export const DEFAULT_AUDIO_PROCESSING_PREFERENCES: LiveKitAudioProcessingPreferences =
  {
    enhancedNoiseSuppressionEnabled: true,
    noiseSuppressionPreset: "balanced",
    selectedAudioInputDeviceId: null,
    selectedAudioOutputDeviceId: null,
    masterVolume: 100,
    microphoneVolume: 100,
  };

