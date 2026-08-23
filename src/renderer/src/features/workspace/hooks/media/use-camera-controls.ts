import { useState, useCallback, useRef, useEffect, type MutableRefObject } from "react";
import { type LobbyStateMember } from "@shared/desktop-api-types";
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
  // The live value, for the code that runs after an await.
  //
  // syncLobbyMediaState is called from the post-join chain, several awaits after
  // resetLocalMediaCapture has already turned the camera off. Reading the state
  // through the render closure it was created in meant it still saw "on" and
  // announced a camera to the new room for a track that had been stopped and
  // unpublished — a phantom badge until the reconciler corrected it.
  const cameraEnabledRef = useRef(false);
  cameraEnabledRef.current = cameraEnabled;

  useEffect(() => {
    if (!cameraPreviewRef.current) return;
    cameraPreviewRef.current.srcObject = cameraPreviewStream;
  }, [cameraPreviewStream]);

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      if (lobbyId.startsWith("call_")) return;
      if (cameraEnabledRef.current) {
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
    [setStatus]
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

  // Resolution and framerate are chosen inside the dialog now, and they are
  // capture constraints — a preview that keeps running on the old ones is
  // showing something the room will not get. Restart it when they change.
  //
  // Guarded by what the CURRENT preview was built with rather than by a
  // dependency list: prepareCameraPreview's identity changes whenever the
  // preview stream does, so this effect re-runs constantly and the ref is what
  // keeps it from re-opening the camera every time.
  const previewPreferencesRef = useRef(cameraPreferences);
  useEffect(() => {
    if (!isCameraShareModalOpen) {
      previewPreferencesRef.current = cameraPreferences;
      return;
    }

    const applied = previewPreferencesRef.current;
    if (
      applied.resolution === cameraPreferences.resolution &&
      applied.frameRate === cameraPreferences.frameRate
    ) {
      return;
    }

    previewPreferencesRef.current = cameraPreferences;
    void prepareCameraPreview();
  }, [cameraPreferences, isCameraShareModalOpen, prepareCameraPreview]);

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

      // Publish at the resolution and framerate the user actually selected.
      // The framerate used to be hard-coded to 30 here, so a 24fps preference
      // was silently ignored and the encoder was told to expect frames that
      // never arrived.
      const isFullHd = cameraPreferences.resolution === "1080p";
      await liveKitSessionRef.current?.publishCameraStream(previewStream, {
        maxBitrateBps: isFullHd ? 2_500_000 : 1_200_000,
        maxFramerate: cameraPreferences.frameRate,
        width: isFullHd ? 1920 : 1280,
        height: isFullHd ? 1080 : 720,
      });

      if (videoTrack) {
        videoTrack.onended = () => {
          const latestLobbyId = activeLobbyRef.current;
          setLocalCameraStream(null);
          setCameraEnabled(false);
          void liveKitSessionRef.current?.unpublishCamera();
          patchLobbyMemberState(currentUserId, { cameraEnabled: false });

          if (latestLobbyId && !latestLobbyId.startsWith("call_")) {
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

      if (!lobbyId.startsWith("call_")) {
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
    cameraPreferences,
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

      if (!lobbyId.startsWith("call_")) {
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
      }

      return;
    }

    openCameraShareModal();
  }, [
    activeLobbyRef,
    cameraEnabled,
    currentUserId,
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




