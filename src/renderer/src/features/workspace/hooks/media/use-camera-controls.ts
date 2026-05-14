import { useState, useCallback, useRef, useEffect, type MutableRefObject } from "react";
import { type LobbyStateMember } from "../../../../../../shared/desktop-api-types";
import { type LiveKitMediaSession } from "@/features/livekit";
import workspaceService from "../../services";
import { type CameraPreferences } from "../../components/settings/settings-main-panel-types";
import {
  buildCameraVideoConstraints,
  stopMediaStreamTracks,
} from "../../workspace-media-utils";

interface UseCameraControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  cameraPreferences: CameraPreferences;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<Pick<LobbyStateMember, "cameraEnabled">>
  ) => void;
}

export const useCameraControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  cameraPreferences,
  setStatus,
  patchLobbyMemberState,
}: UseCameraControlsParams) => {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [isCameraShareModalOpen, setIsCameraShareModalOpen] = useState(false);
  const [isPreparingCameraPreview, setIsPreparingCameraPreview] = useState(false);
  const [isStartingCameraShare, setIsStartingCameraShare] = useState(false);
  const [cameraShareModalError, setCameraShareModalError] = useState<string | null>(null);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!cameraPreviewRef.current) return;
    cameraPreviewRef.current.srcObject = cameraPreviewStream;
  }, [cameraPreviewStream]);

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      if (cameraEnabled) {
        const result = await workspaceService.setLobbyCameraEnabled({
          lobbyId,
          enabled: true,
        });
        if (!result.ok) {
          setStatus(
            `Kamera durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      }
    },
    [cameraEnabled, setStatus]
  );

  const stopCameraPreview = useCallback((): void => {
    stopMediaStreamTracks(cameraPreviewStream);
    setCameraPreviewStream(null);
  }, [cameraPreviewStream]);

  const prepareCameraPreview = useCallback(async (): Promise<void> => {
    setIsPreparingCameraPreview(true);
    setCameraShareModalError(null);
    stopCameraPreview();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: buildCameraVideoConstraints(cameraPreferences),
      });

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          setCameraShareModalError("Kamera onizlemesi durduruldu.");
          setCameraPreviewStream(null);
        };
      }

      setCameraPreviewStream(stream);
    } catch (error) {
      setCameraShareModalError(
        `Kamera onizlemesi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
      );
    } finally {
      setIsPreparingCameraPreview(false);
    }
  }, [cameraPreferences, stopCameraPreview]);

  const openCameraShareModal = useCallback((): void => {
    setCameraShareModalError(null);
    setIsCameraShareModalOpen(true);
    void prepareCameraPreview();
  }, [prepareCameraPreview]);

  const closeCameraShareModal = useCallback((): void => {
    if (isStartingCameraShare || isPreparingCameraPreview) return;
    stopCameraPreview();
    setCameraShareModalError(null);
    setIsCameraShareModalOpen(false);
  }, [isStartingCameraShare, isPreparingCameraPreview, stopCameraPreview]);

  const startCameraShareFromModal = useCallback(async (): Promise<void> => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setCameraShareModalError("Kamera paylasimi icin once bir lobiye katil.");
      return;
    }

    const previewStream = cameraPreviewStream;
    if (!previewStream) {
      setCameraShareModalError("Once kamera onizlemesi baslatilmali. Yenile'ye basip tekrar dene.");
      return;
    }

    setIsStartingCameraShare(true);
    setCameraShareModalError(null);

    try {
      const [videoTrack] = previewStream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = null;
      }

      await liveKitSessionRef.current?.publishCameraStream(previewStream);

      if (videoTrack) {
        videoTrack.onended = () => {
          const latestLobbyId = activeLobbyRef.current;
          setLocalCameraStream(null);
          setCameraEnabled(false);
          void liveKitSessionRef.current?.unpublishCamera();
          patchLobbyMemberState(currentUserId, { cameraEnabled: false });

          if (latestLobbyId) {
            void workspaceService.setLobbyCameraEnabled({
              lobbyId: latestLobbyId,
              enabled: false,
            });
          }
        };
      }

      setLocalCameraStream(previewStream);
      setCameraPreviewStream(null);
      setCameraEnabled(true);
      patchLobbyMemberState(currentUserId, { cameraEnabled: true });

      const result = await workspaceService.setLobbyCameraEnabled({
        lobbyId,
        enabled: true,
      });

      if (!result.ok) {
        setStatus(
          `Kamera durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "warn"
        );
      }

      setIsCameraShareModalOpen(false);
    } catch (error) {
      const msg = `Kamera paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`;
      setCameraShareModalError(msg);
      setStatus(msg, "error");
    } finally {
      setIsStartingCameraShare(false);
    }
  }, [
    activeLobbyRef,
    currentUserId,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
    cameraPreviewStream,
  ]);

  const handleCameraToggle = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Kamerayi acmak icin once bir lobiye katil", "warn");
      return;
    }

    if (cameraEnabled) {
      stopMediaStreamTracks(localCameraStream);
      setLocalCameraStream(null);
      setCameraEnabled(false);
      void liveKitSessionRef.current?.unpublishCamera();
      patchLobbyMemberState(currentUserId, { cameraEnabled: false });

      void workspaceService.setLobbyCameraEnabled({
        lobbyId,
        enabled: false,
      }).then((result) => {
        if (!result.ok) {
          setStatus(
            `Kamera durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      });

      return;
    }

    openCameraShareModal();
  }, [
    activeLobbyRef,
    cameraEnabled,
    localCameraStream,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
    openCameraShareModal,
  ]);

  return {
    cameraEnabled,
    setCameraEnabled,
    localCameraStream,
    setLocalCameraStream,
    isCameraShareModalOpen,
    isPreparingCameraPreview,
    isStartingCameraShare,
    cameraShareModalError,
    cameraPreviewStream,
    setCameraPreviewStream,
    cameraPreviewRef,
    handleCameraToggle,
    prepareCameraPreview,
    startCameraShareFromModal,
    closeCameraShareModal,
    syncLobbyMediaState,
  };
};




