import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import type { LobbyStateMember, ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import type { LiveKitMediaSession } from "@/features/livekit";
import { stopMediaStreamTracks, type ScreenShareQualityPreset, type ScreenShareSourceKind } from "../../workspace-media-utils";
import type { ScreenShareContentMode } from "@/features/screen-share";
import { stopActiveSystemLoopback } from "@/features/screen-share/loopback-audio";
import type { CameraPreferences, StreamPreferences } from "../../components/settings/settings-main-panel-types";

// Sub-hooks
import { useAudioControls } from "./use-audio-controls";
import { useCameraControls } from "./use-camera-controls";
import { useScreenShareControls } from "./use-screen-share-controls";

type StatusTone = "ok" | "warn" | "error";

interface UseWorkspaceMediaControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  cameraPreferences: CameraPreferences;
  streamPreferences: StreamPreferences;
  // Not optional: while it was, the one caller never passed it, the toolbar's
  // stream menu wrote localStorage behind the shell's back, and Ayarlar → Yayın
  // went on showing — and re-saving — the framerate from before the change.
  onSaveStreamPreferences: (next: StreamPreferences) => void;
  setStatus: (message: string, tone: StatusTone) => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<
      Pick<
        LobbyStateMember,
        "muted" | "deafened" | "cameraEnabled" | "screenSharing"
      >
    >,
  ) => void;
}

export interface WorkspaceMediaControlsState {
  micEnabled: boolean;
  setMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  headphoneEnabled: boolean;
  setHeadphoneEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isScreenShareModalOpen: boolean;
  isLoadingScreenShareSources: boolean;
  isStartingScreenShare: boolean;
  screenShareModalError: string | null;
  screenShareSources: ScreenCaptureSourceDescriptor[];
  selectedScreenShareSourceId: string | null;
  setSelectedScreenShareSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedScreenShareSourceKind: ScreenShareSourceKind;
  selectedScreenShareQuality: ScreenShareQualityPreset;
  setSelectedScreenShareQuality: React.Dispatch<React.SetStateAction<ScreenShareQualityPreset>>;
  selectedScreenShareContentMode: ScreenShareContentMode;
  setSelectedScreenShareContentMode: React.Dispatch<React.SetStateAction<ScreenShareContentMode>>;
  captureSystemAudio: boolean;
  setCaptureSystemAudio: React.Dispatch<React.SetStateAction<boolean>>;
  monitorScreenShareSources: ScreenCaptureSourceDescriptor[];
  windowScreenShareSources: ScreenCaptureSourceDescriptor[];
  activeScreenShareSources: ScreenCaptureSourceDescriptor[];
  isCameraShareModalOpen: boolean;
  isPreparingCameraPreview: boolean;
  isStartingCameraShare: boolean;
  cameraShareModalError: string | null;
  cameraPreviewStream: MediaStream | null;
  cameraPreviewRef: React.MutableRefObject<HTMLVideoElement | null>;
  handleMicToggle: () => void;
  // Absolute set, used by push-to-talk where a toggle would desync on a
  // dropped keyup.
  setMicState: (enabled: boolean) => void;
  handleHeadphoneToggle: () => void;
  handleCameraToggle: () => void;
  handleScreenToggle: () => void;
  handleScreenShareSourceKindChange: (kind: ScreenShareSourceKind) => void;
  closeScreenShareModal: () => void;
  loadScreenShareSources: () => Promise<void>;
  startScreenShareFromModal: () => Promise<void>;
  closeCameraShareModal: () => void;
  prepareCameraPreview: () => Promise<void>;
  startCameraShareFromModal: () => Promise<void>;
  syncLobbyAudioState: (lobbyId: string) => Promise<void>;
  // Compares what the server roster says about US against what we believe and
  // re-declares on a mismatch. Fed from the live roster in WorkspaceShell.
  reconcileDeclaredAudioState: (
    serverMuted: boolean | undefined,
    serverDeafened: boolean | undefined,
  ) => void;
  syncLobbyMediaState: (lobbyId: string) => Promise<void>;
  resetLocalMediaCapture: () => void;
}

export const useWorkspaceMediaControls = (params: UseWorkspaceMediaControlsParams): WorkspaceMediaControlsState => {
  const {
    currentUserId,
    activeLobbyRef,
    liveKitSessionRef,
    cameraPreferences,
    streamPreferences,
    onSaveStreamPreferences,
    setStatus,
    patchLobbyMemberState,
  } = params;

  // 1. Audio Controls
  const audio = useAudioControls({
    currentUserId,
    activeLobbyRef,
    liveKitSessionRef,
    setStatus,
    patchLobbyMemberState,
  });

  // 2. Camera Controls
  const camera = useCameraControls({
    currentUserId,
    activeLobbyRef,
    liveKitSessionRef,
    cameraPreferences,
    setStatus,
    patchLobbyMemberState,
  });

  // 3. Screen Share Controls
  const screen = useScreenShareControls({
    currentUserId,
    activeLobbyRef,
    liveKitSessionRef,
    streamPreferences,
    onSaveStreamPreferences,
    setStatus,
    patchLobbyMemberState,
  });

  // --- PERSISTENT REFS FOR CLEANUP ---
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => { localCameraStreamRef.current = camera.localCameraStream; }, [camera.localCameraStream]);
  useEffect(() => { localScreenStreamRef.current = screen.localScreenStream; }, [screen.localScreenStream]);
  useEffect(() => { cameraPreviewStreamRef.current = camera.cameraPreviewStream; }, [camera.cameraPreviewStream]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(localCameraStreamRef.current);
      stopMediaStreamTracks(localScreenStreamRef.current);
      stopMediaStreamTracks(cameraPreviewStreamRef.current);
      void stopActiveSystemLoopback();
    };
  }, []);

  // --- ORCHESTRATION ---

  // Depend on the individual callbacks, not on the hook result objects.
  //
  // useCameraControls and useScreenShareControls return a fresh object literal
  // on every render, so `[camera, screen]` gave this callback — and
  // performPostJoinSynchronization, which wraps it — a new identity every time.
  // The call-room auto-connect effect in WorkspaceShell listed that identity in
  // its deps and therefore re-ran on every render, minting a LiveKit token
  // 1–10 times a second for the whole duration of every call.
  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      await Promise.all([
        camera.syncLobbyMediaState(lobbyId),
        screen.syncLobbyMediaState(lobbyId),
      ]);
    },
    [camera.syncLobbyMediaState, screen.syncLobbyMediaState]
  );

  const resetLocalMediaCapture = useCallback((): void => {
    stopMediaStreamTracks(localCameraStreamRef.current);
    stopMediaStreamTracks(localScreenStreamRef.current);
    stopMediaStreamTracks(cameraPreviewStreamRef.current);

    void liveKitSessionRef.current?.unpublishCamera();
    void liveKitSessionRef.current?.unpublishScreen();

    // System audio loopback is a separate pipeline: a native WASAPI capture
    // feeding PCM over IPC into an AudioWorklet. Stopping the video tracks does
    // not stop it, and leaving the lobby never used to, so it kept capturing
    // and firing ~100 IPC messages a second into a worklet nobody was listening
    // to for the rest of the app's life.
    void stopActiveSystemLoopback();

    camera.setLocalCameraStream(null);
    screen.setLocalScreenStream(null);
    camera.setCameraPreviewStream(null);
    camera.setCameraEnabled(false);
    screen.setScreenEnabled(false);
  }, [
    camera.setLocalCameraStream,
    camera.setCameraPreviewStream,
    camera.setCameraEnabled,
    screen.setLocalScreenStream,
    screen.setScreenEnabled,
    liveKitSessionRef,
  ]);

  return {
    ...audio,
    ...camera,
    ...screen,
    syncLobbyMediaState,
    resetLocalMediaCapture,
  };
};




