import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import type {
  LobbyStateMember,
  ScreenCaptureSourceDescriptor,
} from "../../../../../shared/desktop-api-types";
import type { LiveKitMediaSession } from "../../../services/livekit-stream-manager";
import { startScreenCapture } from "../../../services/screen-capture-service";
import { soundCueService } from "../../../services/sound-cue-service";
import workspaceService from "../../../services/workspace-service";
import type {
  AudioPreferences,
  CameraPreferences,
  StreamPreferences,
} from "../components/settings/settings-main-panel-types";
import {
  buildCameraVideoConstraints,
  getDefaultScreenShareQuality,
  readAudioPreferences,
  readStreamPreferences,
  SCREEN_SHARE_QUALITY_OPTIONS,
  stopMediaStreamTracks,
  type ScreenShareQualityPreset,
  type ScreenShareSourceKind,
} from "../workspace-media-utils";

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
  setSelectedScreenShareSourceId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  selectedScreenShareSourceKind: ScreenShareSourceKind;
  selectedScreenShareQuality: ScreenShareQualityPreset;
  setSelectedScreenShareQuality: React.Dispatch<
    React.SetStateAction<ScreenShareQualityPreset>
  >;
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

export const useWorkspaceMediaControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  cameraPreferences,
  streamPreferences,
  setStatus,
  patchLobbyMemberState,
}: UseWorkspaceMediaControlsParams): WorkspaceMediaControlsState => {
  const [micEnabled, setMicEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultMicEnabled,
  );
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [headphoneEnabled, setHeadphoneEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultHeadphoneEnabled,
  );
  const [localCameraStream, setLocalCameraStream] =
    useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
  const [isLoadingScreenShareSources, setIsLoadingScreenShareSources] =
    useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [screenShareModalError, setScreenShareModalError] = useState<
    string | null
  >(null);
  const [screenShareSources, setScreenShareSources] = useState<
    ScreenCaptureSourceDescriptor[]
  >([]);
  const [selectedScreenShareSourceId, setSelectedScreenShareSourceId] =
    useState<string | null>(null);
  const [selectedScreenShareSourceKind, setSelectedScreenShareSourceKind] =
    useState<ScreenShareSourceKind>("screen");
  const [selectedScreenShareQuality, setSelectedScreenShareQuality] =
    useState<ScreenShareQualityPreset>(() =>
      getDefaultScreenShareQuality(readStreamPreferences().frameRate),
    );
  const [isCameraShareModalOpen, setIsCameraShareModalOpen] = useState(false);
  const [isPreparingCameraPreview, setIsPreparingCameraPreview] =
    useState(false);
  const [isStartingCameraShare, setIsStartingCameraShare] = useState(false);
  const [cameraShareModalError, setCameraShareModalError] = useState<
    string | null
  >(null);
  const [cameraPreviewStream, setCameraPreviewStream] =
    useState<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewStreamRef = useRef<MediaStream | null>(null);

  const monitorScreenShareSources = useMemo(() => {
    return screenShareSources.filter((source) => source.kind === "screen");
  }, [screenShareSources]);

  const windowScreenShareSources = useMemo(() => {
    return screenShareSources.filter((source) => source.kind === "window");
  }, [screenShareSources]);

  const activeScreenShareSources = useMemo(() => {
    return selectedScreenShareSourceKind === "screen"
      ? monitorScreenShareSources
      : windowScreenShareSources;
  }, [
    monitorScreenShareSources,
    selectedScreenShareSourceKind,
    windowScreenShareSources,
  ]);

  useEffect(() => {
    if (!cameraPreviewRef.current) {
      return;
    }

    cameraPreviewRef.current.srcObject = cameraPreviewStream;
  }, [cameraPreviewStream]);

  useEffect(() => {
    localCameraStreamRef.current = localCameraStream;
  }, [localCameraStream]);

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    cameraPreviewStreamRef.current = cameraPreviewStream;
  }, [cameraPreviewStream]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(localCameraStreamRef.current);
      stopMediaStreamTracks(localScreenStreamRef.current);
      stopMediaStreamTracks(cameraPreviewStreamRef.current);
    };
  }, []);

  const syncLobbyAudioState = useCallback(
    async (lobbyId: string): Promise<void> => {
      const updates: Array<Promise<void>> = [];

      if (!micEnabled) {
        updates.push(
          workspaceService
            .setLobbyMuted({
              lobbyId,
              muted: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Mikrofon durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn",
                );
              }
            }),
        );
      }

      if (!headphoneEnabled) {
        updates.push(
          workspaceService
            .setLobbyDeafened({
              lobbyId,
              deafened: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Kulaklik durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn",
                );
              }
            }),
        );
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    },
    [micEnabled, headphoneEnabled, setStatus],
  );

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      const updates: Array<Promise<void>> = [];

      if (cameraEnabled) {
        updates.push(
          workspaceService
            .setLobbyCameraEnabled({
              lobbyId,
              enabled: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Kamera durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn",
                );
              }
            }),
        );
      }

      if (screenEnabled) {
        updates.push(
          workspaceService
            .setLobbyScreenSharing({
              lobbyId,
              enabled: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Yayin durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn",
                );
              }
            }),
        );
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    },
    [cameraEnabled, screenEnabled, setStatus],
  );

  const resetLocalMediaCapture = useCallback((): void => {
    stopMediaStreamTracks(localCameraStream);
    stopMediaStreamTracks(localScreenStream);
    stopMediaStreamTracks(cameraPreviewStream);
    void liveKitSessionRef.current?.unpublishCamera();
    void liveKitSessionRef.current?.unpublishScreen();
    setLocalCameraStream(null);
    setLocalScreenStream(null);
    setCameraPreviewStream(null);
    setCameraEnabled(false);
    setScreenEnabled(false);
  }, [
    localCameraStream,
    localScreenStream,
    cameraPreviewStream,
    liveKitSessionRef,
  ]);

  const handleMicToggle = useCallback((): void => {
    setMicEnabled((previous) => {
      const next = !previous;
      soundCueService.playMicToggle(next);

      const activeLobbyId = activeLobbyRef.current;
      if (activeLobbyId) {
        patchLobbyMemberState(currentUserId, {
          muted: !next,
          speaking: false,
        });
      }

      if (activeLobbyId) {
        void liveKitSessionRef.current
          ?.setMicrophoneEnabled(next)
          .catch((error: unknown) => {
            setStatus(
              `Mikrofon yayini guncellenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
              "warn",
            );
          });

        void workspaceService
          .setLobbyMuted({ lobbyId: activeLobbyId, muted: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Mikrofon durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          });
      }

      return next;
    });
  }, [
    activeLobbyRef,
    currentUserId,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
  ]);

  const handleHeadphoneToggle = useCallback((): void => {
    setHeadphoneEnabled((previous) => {
      const next = !previous;
      soundCueService.playHeadphoneToggle(next);

      const activeLobbyId = activeLobbyRef.current;
      if (activeLobbyId) {
        patchLobbyMemberState(currentUserId, {
          deafened: !next,
        });
      }

      if (activeLobbyId) {
        void workspaceService
          .setLobbyDeafened({ lobbyId: activeLobbyId, deafened: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Kulaklik durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          });
      }

      return next;
    });
  }, [activeLobbyRef, currentUserId, patchLobbyMemberState, setStatus]);

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
        `Kamera onizlemesi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
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
    if (isStartingCameraShare || isPreparingCameraPreview) {
      return;
    }

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
      setCameraShareModalError(
        "Once kamera onizlemesi baslatilmali. Yenile'ye basip tekrar dene.",
      );
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
          patchLobbyMemberState(currentUserId, {
            cameraEnabled: false,
          });

          if (!latestLobbyId) {
            return;
          }

          void workspaceService.setLobbyCameraEnabled({
            lobbyId: latestLobbyId,
            enabled: false,
          });
        };
      }

      setLocalCameraStream(previewStream);
      setCameraPreviewStream(null);
      setCameraEnabled(true);
      patchLobbyMemberState(currentUserId, {
        cameraEnabled: true,
      });

      const result = await workspaceService.setLobbyCameraEnabled({
        lobbyId,
        enabled: true,
      });

      if (!result.ok) {
        setStatus(
          `Kamera durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }

      setIsCameraShareModalOpen(false);
    } catch (error) {
      setCameraShareModalError(
        `Kamera paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
      setStatus(
        `Kamera paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
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
      patchLobbyMemberState(currentUserId, {
        cameraEnabled: false,
      });

      void workspaceService
        .setLobbyCameraEnabled({
          lobbyId,
          enabled: false,
        })
        .then((result) => {
          if (!result.ok) {
            setStatus(
              `Kamera durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn",
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

  const loadScreenShareSources = useCallback(async (): Promise<void> => {
    setIsLoadingScreenShareSources(true);
    setScreenShareModalError(null);

    const result = await workspaceService.listScreenCaptureSources();
    if (!result.ok || !result.data) {
      setScreenShareSources([]);
      setSelectedScreenShareSourceId(null);
      setScreenShareModalError(
        result.error?.message ?? "Yayin kaynaklari alinamadi",
      );
      setIsLoadingScreenShareSources(false);
      return;
    }

    const sources = result.data.sources.map((rawSource) => {
      const sourceId = String(rawSource.id ?? "");
      const inferredKind: ScreenShareSourceKind = sourceId.startsWith("screen:")
        ? "screen"
        : "window";

      return {
        id: sourceId,
        name: String(rawSource.name ?? "Bilinmeyen Kaynak"),
        kind:
          rawSource.kind === "screen" || rawSource.kind === "window"
            ? rawSource.kind
            : inferredKind,
        displayId:
          typeof rawSource.displayId === "string" &&
          rawSource.displayId.length > 0
            ? rawSource.displayId
            : null,
        previewDataUrl:
          rawSource.previewDataUrl ??
          (rawSource as { thumbnailDataUri?: string | null })
            .thumbnailDataUri ??
          null,
      };
    });

    setScreenShareSources(sources);

    setSelectedScreenShareSourceId((previous) => {
      if (previous && sources.some((source) => source.id === previous)) {
        return previous;
      }

      const preferred =
        sources.find((source) => source.kind === "screen") ?? sources[0];

      return preferred?.id ?? null;
    });

    setSelectedScreenShareSourceKind(() => {
      const hasScreens = sources.some((source) => source.kind === "screen");
      return hasScreens ? "screen" : "window";
    });

    setIsLoadingScreenShareSources(false);
  }, []);

  const handleScreenShareSourceKindChange = useCallback(
    (kind: ScreenShareSourceKind): void => {
      setSelectedScreenShareSourceKind(kind);

      const candidates =
        kind === "screen"
          ? monitorScreenShareSources
          : windowScreenShareSources;

      setSelectedScreenShareSourceId((previous) => {
        if (previous && candidates.some((source) => source.id === previous)) {
          return previous;
        }

        return candidates[0]?.id ?? null;
      });
    },
    [monitorScreenShareSources, windowScreenShareSources],
  );

  const closeScreenShareModal = useCallback((): void => {
    if (isStartingScreenShare) {
      return;
    }

    setIsScreenShareModalOpen(false);
    setScreenShareModalError(null);
  }, [isStartingScreenShare]);

  const openScreenShareModal = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    setSelectedScreenShareQuality(
      getDefaultScreenShareQuality(streamPreferences.frameRate),
    );
    setIsScreenShareModalOpen(true);
    void loadScreenShareSources();
  }, [
    activeLobbyRef,
    setStatus,
    streamPreferences.frameRate,
    loadScreenShareSources,
  ]);

  const startScreenShareFromModal = useCallback(async (): Promise<void> => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    const selectedSourceId = selectedScreenShareSourceId;
    if (!selectedSourceId) {
      setScreenShareModalError("Lütfen bir pencere veya monitör seç.");
      return;
    }

    const qualityOption =
      SCREEN_SHARE_QUALITY_OPTIONS.find(
        (option) => option.id === selectedScreenShareQuality,
      ) ?? SCREEN_SHARE_QUALITY_OPTIONS[1];

    setIsStartingScreenShare(true);
    setScreenShareModalError(null);

    try {
      const { stream, warning, sourceName } = await startScreenCapture({
        frameRate: qualityOption.frameRate,
        resolution: qualityOption.resolution,
        captureSystemAudio: streamPreferences.captureSystemAudio,
        sourceId: selectedSourceId,
      });

      try {
        await liveKitSessionRef.current?.publishScreenStream(stream);
      } catch (error) {
        stopMediaStreamTracks(stream);
        throw error;
      }

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          const latestLobbyID = activeLobbyRef.current;
          setLocalScreenStream(null);
          setScreenEnabled(false);
          void liveKitSessionRef.current?.unpublishScreen();
          patchLobbyMemberState(currentUserId, {
            screenSharing: false,
          });

          if (!latestLobbyID) {
            return;
          }

          void workspaceService.setLobbyScreenSharing({
            lobbyId: latestLobbyID,
            enabled: false,
          });
        };
      }

      if (warning) {
        setStatus(warning, "warn");
      } else if (sourceName) {
        setStatus(`Yayin baslatildi: ${sourceName}`, "ok");
      }

      setLocalScreenStream(stream);
      setScreenEnabled(true);
      patchLobbyMemberState(currentUserId, {
        screenSharing: true,
      });

      const result = await workspaceService.setLobbyScreenSharing({
        lobbyId,
        enabled: true,
      });

      if (!result.ok) {
        setStatus(
          `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }

      setIsScreenShareModalOpen(false);
    } catch (error) {
      setStatus(
        `Ekran paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    } finally {
      setIsStartingScreenShare(false);
    }
  }, [
    activeLobbyRef,
    currentUserId,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
    streamPreferences.captureSystemAudio,
    selectedScreenShareSourceId,
    selectedScreenShareQuality,
  ]);

  const handleScreenToggle = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    if (screenEnabled) {
      stopMediaStreamTracks(localScreenStream);
      setLocalScreenStream(null);
      setScreenEnabled(false);
      void liveKitSessionRef.current?.unpublishScreen();
      patchLobbyMemberState(currentUserId, {
        screenSharing: false,
      });

      void workspaceService
        .setLobbyScreenSharing({
          lobbyId,
          enabled: false,
        })
        .then((result) => {
          if (!result.ok) {
            setStatus(
              `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn",
            );
          }
        });

      return;
    }

    openScreenShareModal();
  }, [
    activeLobbyRef,
    screenEnabled,
    localScreenStream,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
    openScreenShareModal,
  ]);

  return {
    micEnabled,
    setMicEnabled,
    headphoneEnabled,
    setHeadphoneEnabled,
    cameraEnabled,
    screenEnabled,
    localCameraStream,
    localScreenStream,
    isScreenShareModalOpen,
    isLoadingScreenShareSources,
    isStartingScreenShare,
    screenShareModalError,
    screenShareSources,
    selectedScreenShareSourceId,
    setSelectedScreenShareSourceId,
    selectedScreenShareSourceKind,
    selectedScreenShareQuality,
    setSelectedScreenShareQuality,
    monitorScreenShareSources,
    windowScreenShareSources,
    activeScreenShareSources,
    isCameraShareModalOpen,
    isPreparingCameraPreview,
    isStartingCameraShare,
    cameraShareModalError,
    cameraPreviewStream,
    cameraPreviewRef,
    handleMicToggle,
    handleHeadphoneToggle,
    handleCameraToggle,
    handleScreenToggle,
    handleScreenShareSourceKindChange,
    closeScreenShareModal,
    loadScreenShareSources,
    startScreenShareFromModal,
    closeCameraShareModal,
    prepareCameraPreview,
    startCameraShareFromModal,
    syncLobbyAudioState,
    syncLobbyMediaState,
    resetLocalMediaCapture,
  };
};
