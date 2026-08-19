import type {
  Participant,
  Track,
} from "livekit-client";
import { type ActiveNoiseSuppressionMode } from "../mic";
import type { NoiseSuppressionPreset } from "@/features/rnnoise";
import type { MediaStatsSnapshot } from "./stats-collector";
import type { ScreenWatcherMap } from "./screen-watchers";

export type ScreenShareMode = "slides" | "motion";
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
  isSpeaking: boolean;
  // No audioLevel here on purpose.
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

export interface LiveKitStreamManagerCallbacks {
  onRemoteStreamsChanged?: (media: ParticipantMediaMap) => void;
  onConnectionStateChanged?: (status: LiveKitConnectionStatus) => void;
  onActiveSpeakersChanged?: (speakerIds: string[]) => void;
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
}

export interface LiveKitAudioProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  masterVolume: number;
  microphoneVolume: number;
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
