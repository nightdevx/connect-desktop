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

export const HIGH_PROFILE = {
  name: "HIGH",
  maxBitrateBps: 4_000_000,
  maxFramerate: 30,
};
