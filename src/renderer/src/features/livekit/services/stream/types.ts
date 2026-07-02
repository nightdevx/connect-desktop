import type {
  Participant,
  Track,
} from "livekit-client";
import { type ActiveNoiseSuppressionMode } from "../mic";

export type ScreenShareMode = "slides" | "motion";
export type LiveKitConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ParticipantMediaState {
  participant: Participant;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  isSpeaking: boolean;
  audioLevel: number;
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
}

export interface LiveKitStreamManagerCallbacks {
  onRemoteStreamsChanged?: (media: ParticipantMediaMap) => void;
  onConnectionStateChanged?: (status: LiveKitConnectionStatus) => void;
  onActiveSpeakersChanged?: (speakerIds: string[]) => void;
  onWarning?: (message: string) => void;
  onNoiseSuppressionModeChanged?: (mode: ActiveNoiseSuppressionMode) => void;
}

export interface LiveKitAudioProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: any;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  masterVolume: number;
  microphoneVolume: number;
}

export interface QualityProfile {
  name: string;
  maxBitrateBps: number;
  maxFramerate: number;
}

// Per-publish video encoding target, derived from the user-selected screen/camera
// quality. Threaded into publishTrack so the selected resolution/fps/bitrate
// actually reaches the encoder (previously capped by fixed publishDefaults).
export interface VideoPublishQuality {
  maxBitrateBps: number;
  maxFramerate: number;
  width?: number;
  height?: number;
}
