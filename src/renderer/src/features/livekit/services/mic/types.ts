import type {
  AudioCaptureOptions,
  LocalParticipant,
  TrackPublishOptions,
} from "livekit-client";
import type { NoiseSuppressionPreset, ActiveNoiseSuppressionMode } from "../../../rnnoise";

export type { ActiveNoiseSuppressionMode };

export interface MicrophoneProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
}

export interface ApplyMicrophoneStateOptions {
  enabled: boolean;
  participant: LocalParticipant;
  preferences: MicrophoneProcessingPreferences;
  publishOptions: TrackPublishOptions;
}

export interface MicrophoneAttempt {
  options: AudioCaptureOptions;
  warning?: string;
}
