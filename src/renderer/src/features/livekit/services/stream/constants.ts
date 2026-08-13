import { Track } from "livekit-client";
import type {
  LiveKitAudioProcessingPreferences,
} from "./types";

// A screen share is two publications: the video and, optionally, the system
// audio captured with it. Watching means both or neither — subscribing to the
// audio of a stream you are not looking at is never what anyone wants.
export const isScreenSource = (source: Track.Source): boolean => {
  return (
    source === Track.Source.ScreenShare ||
    source === Track.Source.ScreenShareAudio
  );
};

export const DEFAULT_AUDIO_PROCESSING_PREFERENCES: LiveKitAudioProcessingPreferences =
  {
    enhancedNoiseSuppressionEnabled: true,
    noiseSuppressionPreset: "balanced",
    selectedAudioInputDeviceId: null,
    selectedAudioOutputDeviceId: null,
    masterVolume: 100,
    microphoneVolume: 100,
  };

