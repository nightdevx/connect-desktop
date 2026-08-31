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

// livekit.TrackSource.MICROPHONE, as it travels on the wire.
//
// The enum lives in @livekit/protocol — livekit-client's own dependency, not one
// this app declares — and pulling in a package we do not depend on for a single
// constant is a worse trade than writing the constant down. Protobuf enum values
// are part of the protocol contract and do not move.
export const PROTO_TRACK_SOURCE_MICROPHONE = 2;

/**
 * What a permission update means for this client's microphone.
 *
 * A moderator mute is enforced by dropping MICROPHONE from the publish grant, so
 * this is the only signal that says, at the moment it happens, "you may not
 * speak" — or "you may again". Both matter: nothing was listening, so a lifted
 * mute left the user silent with their own mic button showing open, and the only
 * way back was to leave the room and rejoin.
 *
 * `lastObserved` is null until the first permission arrives. That first one is
 * the token's own grant landing at join, not a decision anybody made, and
 * treating it as a change put "your restriction has been lifted" on screen every
 * time somebody walked into a room.
 */
export const resolveMicrophonePermission = (
  canPublishSources: number[] | undefined,
  lastObserved: boolean | null,
): { allowed: boolean; announce: boolean; republish: boolean } => {
  // An empty (or absent) list is LiveKit for "no per-source restriction", which
  // is every room nobody has ever been muted in.
  const sources = canPublishSources ?? [];
  const allowed =
    sources.length === 0 || sources.includes(PROTO_TRACK_SOURCE_MICROPHONE);

  const changed = lastObserved !== null && lastObserved !== allowed;

  return {
    allowed,
    announce: changed,
    // Republishing is only ever the granting direction. On a revoke the SFU has
    // already dropped the track, and asking for the microphone back would fail
    // through every capture attempt and surface as a device warning — for a mute
    // somebody applied on purpose.
    republish: changed && allowed,
  };
};

export const DEFAULT_AUDIO_PROCESSING_PREFERENCES: LiveKitAudioProcessingPreferences =
  {
    enhancedNoiseSuppressionEnabled: true,
    echoCancellationEnabled: true,
    noiseSuppressionPreset: "balanced",
    selectedAudioInputDeviceId: null,
    selectedAudioOutputDeviceId: null,
    masterVolume: 100,
    microphoneVolume: 100,
  };

