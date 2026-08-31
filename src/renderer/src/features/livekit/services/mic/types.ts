import type {
  AudioCaptureOptions,
  LocalParticipant,
  TrackPublishOptions,
} from "livekit-client";
import type { NoiseSuppressionPreset, ActiveNoiseSuppressionMode } from "@/features/rnnoise";

export type { ActiveNoiseSuppressionMode };

export interface MicrophoneProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  /** 0-200. Applied inside the publish chain, not just the level meter. */
  microphoneVolume: number;
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
