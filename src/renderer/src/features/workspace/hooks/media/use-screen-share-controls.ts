import { useState, useCallback, useMemo, type MutableRefObject } from "react";
import {
  type LobbyStateMember,
  type ScreenCaptureSourceDescriptor,
} from "../../../../../../shared/desktop-api-types";
import { type LiveKitMediaSession } from "@/features/livekit";
import { 
  startScreenCapture,
  type ScreenShareQualityPreset,
  type ScreenShareSourceKind,
  type ScreenShareQualityOption,
  SCREEN_SHARE_QUALITY_OPTIONS,
  getDefaultScreenShareQuality
} from "@/features/screen-share";
import workspaceService from "../../services";
import { type StreamPreferences } from "../../components/settings/settings-main-panel-types";
import {
  readStreamPreferences,
  stopMediaStreamTracks,
} from "../../workspace-media-utils";

interface UseScreenShareControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  streamPreferences: StreamPreferences;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<Pick<LobbyStateMember, "screenSharing">>
  ) => void;
}

export const useScreenShareControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  streamPreferences,
  setStatus,
  patchLobbyMemberState,
}: UseScreenShareControlsParams) => {
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
  const [isLoadingScreenShareSources, setIsLoadingScreenShareSources] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [screenShareModalError, setScreenShareModalError] = useState<string | null>(null);
  const [screenShareSources, setScreenShareSources] = useState<ScreenCaptureSourceDescriptor[]>([]);
  const [selectedScreenShareSourceId, setSelectedScreenShareSourceId] = useState<string | null>(null);
  const [selectedScreenShareSourceKind, setSelectedScreenShareSourceKind] = useState<ScreenShareSourceKind>("screen");
  const [selectedScreenShareQuality, setSelectedScreenShareQuality] = useState<ScreenShareQualityPreset>(() =>
    getDefaultScreenShareQuality(readStreamPreferences().frameRate)
  );
  const [captureSystemAudio, setCaptureSystemAudio] = useState(() => streamPreferences.captureSystemAudio);

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
  }, [monitorScreenShareSources, selectedScreenShareSourceKind, windowScreenShareSources]);

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      if (lobbyId.startsWith("call_")) return;
      if (screenEnabled) {
        const result = await workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: true,
        });
        if (!result.ok) {
          setStatus(
            `Yayin durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      }
    },
    [screenEnabled, setStatus]
  );

  const loadScreenShareSources = useCallback(async (): Promise<void> => {
    setIsLoadingScreenShareSources(true);
    setScreenShareModalError(null);

    const result = await workspaceService.listScreenCaptureSources();
    if (!result.ok || !result.data) {
      setScreenShareSources([]);
      setSelectedScreenShareSourceId(null);
      setScreenShareModalError(result.error?.message ?? "Yayin kaynaklari alinamadi");
      setIsLoadingScreenShareSources(false);
      return;
    }

    const sources = result.data.sources.map((rawSource: any) => {
      const sourceId = String(rawSource.id ?? "");
      const inferredKind: ScreenShareSourceKind = sourceId.startsWith("screen:") ? "screen" : "window";

      return {
        id: sourceId,
        name: String(rawSource.name ?? "Bilinmeyen Kaynak"),
        kind: (rawSource.kind === "screen" || rawSource.kind === "window") ? rawSource.kind : inferredKind,
        displayId: (typeof rawSource.displayId === "string" && rawSource.displayId.length > 0) ? rawSource.displayId : null,
        previewDataUrl: rawSource.previewDataUrl ?? (rawSource as any).thumbnailDataUri ?? null,
      };
    });

    setScreenShareSources(sources);

    setSelectedScreenShareSourceId((previous) => {
      if (previous && sources.some((source: any) => source.id === previous)) return previous;
      const preferred = sources.find((source: any) => source.kind === "screen") ?? sources[0];
      return preferred?.id ?? null;
    });

    setSelectedScreenShareSourceKind(() => {
      const hasScreens = sources.some((source: any) => source.kind === "screen");
      return hasScreens ? "screen" : "window";
    });

    setIsLoadingScreenShareSources(false);
  }, []);

  const handleScreenShareSourceKindChange = useCallback(
    (kind: ScreenShareSourceKind): void => {
      setSelectedScreenShareSourceKind(kind);
      const candidates = kind === "screen" ? monitorScreenShareSources : windowScreenShareSources;
      setSelectedScreenShareSourceId((previous) => {
        if (previous && candidates.some((source) => source.id === previous)) return previous;
        return candidates[0]?.id ?? null;
      });
    },
    [monitorScreenShareSources, windowScreenShareSources]
  );

  const closeScreenShareModal = useCallback((): void => {
    if (isStartingScreenShare) return;
    setIsScreenShareModalOpen(false);
    setScreenShareModalError(null);
  }, [isStartingScreenShare]);

  const openScreenShareModal = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    setSelectedScreenShareQuality(getDefaultScreenShareQuality(streamPreferences.frameRate));
    setCaptureSystemAudio(streamPreferences.captureSystemAudio);
    setIsScreenShareModalOpen(true);
    void loadScreenShareSources();
  }, [activeLobbyRef, setStatus, streamPreferences.frameRate, streamPreferences.captureSystemAudio, loadScreenShareSources]);

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

    const qualityOption = SCREEN_SHARE_QUALITY_OPTIONS.find((option: ScreenShareQualityOption) => option.id === selectedScreenShareQuality) ?? SCREEN_SHARE_QUALITY_OPTIONS[1];

    setIsStartingScreenShare(true);
    setScreenShareModalError(null);

    try {
      const { stream, warning, sourceName } = await startScreenCapture({
        frameRate: qualityOption.frameRate,
        resolution: qualityOption.resolution,
        captureSystemAudio,
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
          patchLobbyMemberState(currentUserId, { screenSharing: false });

          if (latestLobbyID && !latestLobbyID.startsWith("call_")) {
            void workspaceService.setLobbyScreenSharing({
              lobbyId: latestLobbyID,
              enabled: false,
            });
          }
        };
      }

      if (warning) setStatus(warning, "warn");
      else if (sourceName) setStatus(`Yayin baslatildi: ${sourceName}`, "ok");

      setLocalScreenStream(stream);
      setScreenEnabled(true);
      patchLobbyMemberState(currentUserId, { screenSharing: true });

      if (!lobbyId.startsWith("call_")) {
        const result = await workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: true,
        });

        if (!result.ok) {
          setStatus(
            `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      }

      setIsScreenShareModalOpen(false);
    } catch (error) {
      setStatus(
        `Ekran paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error"
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
      patchLobbyMemberState(currentUserId, { screenSharing: false });

      if (!lobbyId.startsWith("call_")) {
        void workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: false,
        }).then((result) => {
          if (!result.ok) {
            setStatus(
              `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn"
            );
          }
        });
      }

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
    screenEnabled,
    setScreenEnabled,
    localScreenStream,
    setLocalScreenStream,
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
    captureSystemAudio,
    setCaptureSystemAudio,
    monitorScreenShareSources,
    windowScreenShareSources,
    activeScreenShareSources,
    handleScreenToggle,
    handleScreenShareSourceKindChange,
    closeScreenShareModal,
    loadScreenShareSources,
    startScreenShareFromModal,
    syncLobbyMediaState,
  };
};




