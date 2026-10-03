import type {
  Participant,
  Track,
} from "livekit-client";
import { type ActiveNoiseSuppressionMode } from "../mic";
import type { NoiseSuppressionPreset } from "@/features/rnnoise";
import type { MediaStatsSnapshot } from "./stats-collector";
import type { ScreenWatcherMap } from "./screen-watchers";
import type { CallEncryptionState } from "./call-e2ee";

export type ScreenShareMode = "slides" | "motion";

export type PausedTrackKind = "camera" | "screen";

export type PausedTrackMap = Record<string, boolean>;

export const pausedTrackKey = (
  identity: string,
  kind: PausedTrackKind,
): string => `${identity}:${kind}`;
export type LiveKitConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  // The server ended this session on purpose — the participant was removed,
  // the room was deleted, or the same identity connected somewhere else.
  // Distinct from "disconnected" because retrying does not help: at best it
  // fails, and for a duplicate identity the retry is what caused the eviction,
  // so reconnecting just reproduces it.
  | "closed";

export interface ParticipantMediaState {
  participant: Participant;
  micEnabled: boolean;
  cameraEnabled: boolean;
  // screenEnabled means "this stream is subscribed and rendering for me".
  // screenAvailable means "this person is broadcasting".
  //
  // They used to be the same flag, because every screen track was subscribed
  // automatically the moment it was published: opening a share pushed video to
  // every person in the room whether or not they wanted to watch, and there was
  // no way to stop. Watching is opt-in now, so the two have to be separate —
  // the roster still needs to show that a stream exists in order to offer the
  // "watch" button.
  screenEnabled: boolean;
  screenAvailable: boolean;
  // No audioLevel or isSpeaking here on purpose.
  //
  // It was published at 10Hz and read by nobody but a `> 0.01` test that was
  // wrong anyway (see use-lobby-participants). Carrying a continuously changing
  // number through this map meant every tick rebuilt it and re-rendered every
  // participant tile, competing with the encoder during a screen share. A volume
  // meter would want it back — as its own subscription, not as part of the state
  // every tile depends on.
  camera: Track | MediaStream | null;
  screen: Track | MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export type ParticipantMediaMap = Record<string, ParticipantMediaState>;

export interface RemoteParticipantAudioPreference {
  muted: boolean;
  volumePercent: number;
  cameraHidden?: boolean;
  screenAudioMuted?: boolean;
  screenAudioVolumePercent?: number;
  /**
   * Silences this person's soundboard only.
   *
   * Kept here with the rest of "what I want to hear from this person" even
   * though it never reaches LiveKit: an emote is a lobby-stream event and is
   * played locally, so this is applied at playback and pushed to no session.
   */
  emoteMuted?: boolean;
}

/**
 * Who asked for a connect(). Recorded with every request so the diagnostics can
 * tell a user clicking into a room from the background recovery doing it — the
 * two used to be indistinguishable, which is how an automatic rejoin that tore
 * down a healthy room hid among ordinary room changes.
 *
 * The workspace's reconnect reasons are a subset of this union, so the scheduler
 * passes its reason straight through.
 */
export type LiveKitConnectTrigger =
  | "user-join"
  | "call-sync"
  | "network-online"
  | "livekit-disconnected"
  | "membership-lost"
  | "unspecified";

/**
 * One request for a LiveKit session: who asked for it, and when.
 *
 * `requestedAt` is a performance.now() stamp taken where the request began —
 * the click, before the lobby join round trip and the token fetch, or the
 * moment a reconnect attempt started. The time to first remote audio is
 * measured from it, so it covers everything the user waited through rather
 * than room.connect() alone.
 */
export interface LiveKitConnectRequest {
  trigger: LiveKitConnectTrigger;
  requestedAt: number;
}

export const liveKitConnectRequest = (
  trigger: LiveKitConnectTrigger,
): LiveKitConnectRequest => ({ trigger, requestedAt: performance.now() });

export interface LiveKitConnectionStateDetail {
  /**
   * This client ended the session on purpose (leaving a room). The UI still
   * needs to hear "disconnected", but nothing should treat it as a drop and
   * schedule a rejoin.
   */
  expected?: boolean;
}

export interface LiveKitStreamManagerCallbacks {
  /**
   * A 1:1 call's end-to-end encryption: set up, keyed (with the safety code),
   * or null when the session left the call room.
   */
  onCallEncryptionChanged?: (state: CallEncryptionState | null) => void;
  onRemoteStreamsChanged?: (media: ParticipantMediaMap) => void;
  onConnectionStateChanged?: (
    status: LiveKitConnectionStatus,
    detail?: LiveKitConnectionStateDetail,
  ) => void;
  onActiveSpeakersChanged?: (speakerIds: string[]) => void;
  onSpeakingChanged?: (identities: string[]) => void;
  onWarning?: (message: string) => void;
  onNoiseSuppressionModeChanged?: (mode: ActiveNoiseSuppressionMode) => void;
  /** Real WebRTC stats, sampled once per second while connected. */
  onMediaStats?: (snapshot: MediaStatsSnapshot) => void;
  /**
   * Who is watching each screen share in the room, this client included.
   *
   * Only fires when the audience actually changed — the underlying data
   * channel re-announces whole state, so most frames say nothing new.
   */
  onScreenWatchersChanged?: (watchers: ScreenWatcherMap) => void;
  /**
   * A moderator took this user's microphone away, or gave it back.
   *
   * Read off the server's publish grant rather than off the roster: the grant is
   * what actually decides whether audio leaves this machine, and it is the only
   * signal that arrives at the moment it changes. The session republishes the
   * microphone by itself when it comes back — this exists so the UI can say what
   * happened, because a silenced user was otherwise shown their own microphone
   * as open and had no way to tell why nobody could hear them.
   */
  onMicrophonePermissionChanged?: (allowed: boolean) => void;
  onConnectionQualityChanged?: (identity: string, quality: string) => void;
  onPausedTracksChanged?: (paused: PausedTrackMap) => void;
}

export interface LiveKitAudioProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  masterVolume: number;
  microphoneVolume: number;
  // "Ses seviyelerini dengele": the per-voice compressor on playback.
  voiceLevellingEnabled: boolean;
}


// Per-publish video encoding target, derived from the user-selected screen/camera
// quality. Threaded into publishTrack so the selected resolution/fps/bitrate
// actually reaches the encoder (previously capped by fixed publishDefaults).
// width/height are required: the simulcast ladder is derived from them, and a
// ladder guessed from the wrong base is what made the old fixed 720p/360p
// layers describe a stream nobody was sending.
export interface VideoPublishQuality {
  maxBitrateBps: number;
  maxFramerate: number;
  width: number;
  height: number;
}
