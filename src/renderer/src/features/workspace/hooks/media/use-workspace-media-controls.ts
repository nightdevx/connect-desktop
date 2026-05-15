import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import type { LobbyStateMember, ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import type { LiveKitMediaSession } from "@/features/livekit";
import { stopMediaStreamTracks, type ScreenShareQualityPreset, type ScreenShareSourceKind } from "../../workspace-media-utils";
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
  setStatus: (message: string, tone: StatusTone) => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<
      Pick<
        LobbyStateMember,
        "muted" | "deafened" | "speaking" | "cameraEnabled" | "screenSharing"
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
    };
  }, []);

  // --- ORCHESTRATION ---

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      await Promise.all([
        camera.syncLobbyMediaState(lobbyId),
        screen.syncLobbyMediaState(lobbyId),
      ]);
    },
    [camera, screen]
  );

  const resetLocalMediaCapture = useCallback((): void => {
    stopMediaStreamTracks(camera.localCameraStream);
    stopMediaStreamTracks(screen.localScreenStream);
    stopMediaStreamTracks(camera.cameraPreviewStream);
    
    void liveKitSessionRef.current?.unpublishCamera();
    void liveKitSessionRef.current?.unpublishScreen();

    camera.setLocalCameraStream(null);
    screen.setLocalScreenStream(null);
    camera.setCameraPreviewStream(null);
    camera.setCameraEnabled(false);
    screen.setScreenEnabled(false);
  }, [camera, screen, liveKitSessionRef]);

  return {
    ...audio,
    ...camera,
    ...screen,
    syncLobbyMediaState,
    resetLocalMediaCapture,
  };
};




