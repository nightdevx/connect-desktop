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

/**
 * The one rule for whether a remote publication should be subscribed.
 *
 * Three places used to answer this independently — the TrackPublished handler,
 * the post-connect catch-up pass, and the deafen toggle — and only two of them
 * knew that screen shares are opt-in. The deafen toggle walked every audio
 * publication and subscribed it, screen-share audio included, so un-deafening
 * pulled the audio of a stream nobody had asked to watch. It was not a rare
 * path either: the audio-controls effect calls setDeafened(false) again on
 * every microphone toggle, so a single push-to-talk press was enough. The
 * video stayed unsubscribed, which is why the sound arrived with no picture
 * to explain it.
 */
export const shouldSubscribePublication = (params: {
  kind: Track.Kind;
  source: Track.Source;
  deafened: boolean;
  watchingScreen: boolean;
}): boolean => {
  // Deafen only silences audio; a screen share you are watching keeps its
  // picture.
  const blockedByDeafen = params.kind === Track.Kind.Audio && params.deafened;

  if (isScreenSource(params.source)) {
    return params.watchingScreen && !blockedByDeafen;
  }

  return !blockedByDeafen;
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

