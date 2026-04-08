import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LobbyDescriptor, UserRole } from "../../../shared/auth-contracts";
import type {
  LobbyStateMember,
  ScreenCaptureSourceDescriptor,
} from "../../../shared/desktop-api-types";
import {
  WorkspaceMainPanel,
  WorkspaceRail,
  WorkspaceSidebar,
} from "../features/workspace/components";
import { useDirectMessages } from "../features/workspace/hooks/use-direct-messages";
import { useLobbyRoom } from "../features/workspace/hooks/use-lobby-room";
import { useWorkspaceUsers } from "../features/workspace/hooks/use-workspace-users";
import {
  LiveKitMediaSession,
  type ParticipantMediaMap,
} from "../services/livekit-media-session";
import { startScreenCapture } from "../services/screen-capture-service";
import { soundCueService } from "../services/sound-cue-service";
import workspaceService from "../services/workspace-service";
import { useUiStore } from "../store/ui-store";

interface WorkspaceShellProps {
  currentUserId: string;
  currentUsername: string;
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
  onLogout: () => void;
  isLoggingOut: boolean;
}

type AudioConnectionTone = "ok" | "warn" | "error" | "idle";

type ReconnectStatusKey = "network" | "lobbyStream" | "activeLobby" | "livekit";

type CameraPreferences = {
  resolution: "720p" | "1080p";
  frameRate: 24 | 30;
};

type AudioPreferences = {
  defaultMicEnabled: boolean;
  defaultHeadphoneEnabled: boolean;
  notificationSoundsEnabled: boolean;
};

type StreamPreferences = {
  frameRate: 15 | 30 | 60;
  captureSystemAudio: boolean;
};

type ScreenShareQualityPreset = "smooth" | "balanced" | "sharp";

interface ScreenShareQualityOption {
  id: ScreenShareQualityPreset;
  label: string;
  description: string;
  frameRate: 15 | 30 | 60;
  resolution: "720p" | "1080p" | "1440p";
}

interface AudioConnectionSnapshot {
  statusText: string;
  tone: AudioConnectionTone;
  pingMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  successfulSamples: number;
  failedSamples: number;
  networkType: string | null;
  networkRttMs: number | null;
  downlinkMbps: number | null;
  lastMeasuredAt: string | null;
}

interface NavigatorConnectionLike {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
}

const AUDIO_SAMPLE_LIMIT = 16;
const CAMERA_SETTINGS_STORAGE_KEY = "ct.settings.camera";
const AUDIO_SETTINGS_STORAGE_KEY = "ct.settings.audio";
const STREAM_SETTINGS_STORAGE_KEY = "ct.settings.stream";
const LOBBY_STREAM_RECONNECT_BASE_MS = 1_000;
const LOBBY_STREAM_RECONNECT_MAX_MS = 10_000;
const ACTIVE_LOBBY_RECONNECT_BASE_MS = 1_200;
const ACTIVE_LOBBY_RECONNECT_MAX_MS = 15_000;
const RECONNECT_MAX_EXPONENT = 5;
const RECONNECT_JITTER_MAX_MS = 450;
const AUDIO_PROBE_TIMEOUT_MS = 2_400;
const AUDIO_PROBE_STABLE_INTERVAL_MS = 2_800;
const AUDIO_PROBE_DEGRADED_INTERVAL_MS = 2_000;
const AUDIO_PROBE_FAILURE_INTERVAL_MS = 1_200;
const AUDIO_PROBE_BACKGROUND_INTERVAL_MS = 4_800;
const AUDIO_PING_EMA_ALPHA = 0.35;

const isBrowserOnline = (): boolean => {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
};

const withReconnectJitter = (delayMs: number): number => {
  return delayMs + Math.floor(Math.random() * RECONNECT_JITTER_MAX_MS);
};

const SCREEN_SHARE_QUALITY_OPTIONS: ScreenShareQualityOption[] = [
  {
    id: "smooth",
    label: "Akıcı",
    description: "720p • 30 FPS",
    frameRate: 30,
    resolution: "720p",
  },
  {
    id: "balanced",
    label: "Dengeli",
    description: "1080p • 30 FPS",
    frameRate: 30,
    resolution: "1080p",
  },
  {
    id: "sharp",
    label: "Net",
    description: "1440p • 60 FPS",
    frameRate: 60,
    resolution: "1440p",
  },
];

const getDefaultScreenShareQuality = (
  frameRate: StreamPreferences["frameRate"],
): ScreenShareQualityPreset => {
  if (frameRate === 60) {
    return "sharp";
  }

  return "balanced";
};

const isMainLobby = (lobby: Pick<LobbyDescriptor, "id" | "name">): boolean => {
  return (
    lobby.id === "main-lobby" ||
    lobby.name.trim().toLocaleLowerCase("tr-TR") === "ana lobi"
  );
};

const sortLobbiesWithMainFirst = (
  lobbies: LobbyDescriptor[],
): LobbyDescriptor[] => {
  return [...lobbies].sort((left, right) => {
    const leftIsMain = isMainLobby(left);
    const rightIsMain = isMainLobby(right);
    if (leftIsMain !== rightIsMain) {
      return leftIsMain ? -1 : 1;
    }

    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id, "tr");
    }

    return left.createdAt.localeCompare(right.createdAt, "tr");
  });
};

const readCameraPreferences = (): CameraPreferences => {
  try {
    const raw = localStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { resolution: "720p", frameRate: 30 };
    }

    const parsed = JSON.parse(raw) as Partial<CameraPreferences>;
    return {
      resolution: parsed.resolution === "1080p" ? "1080p" : "720p",
      frameRate: parsed.frameRate === 24 ? 24 : 30,
    };
  } catch {
    return { resolution: "720p", frameRate: 30 };
  }
};

const readAudioPreferences = (): AudioPreferences => {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        defaultMicEnabled: true,
        defaultHeadphoneEnabled: true,
        notificationSoundsEnabled: true,
      };
    }

    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      defaultMicEnabled: parsed.defaultMicEnabled !== false,
      defaultHeadphoneEnabled: parsed.defaultHeadphoneEnabled !== false,
      notificationSoundsEnabled: parsed.notificationSoundsEnabled !== false,
    };
  } catch {
    return {
      defaultMicEnabled: true,
      defaultHeadphoneEnabled: true,
      notificationSoundsEnabled: true,
    };
  }
};

const readStreamPreferences = (): StreamPreferences => {
  try {
    const raw = localStorage.getItem(STREAM_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        frameRate: 30,
        captureSystemAudio: false,
      };
    }

    const parsed = JSON.parse(raw) as Partial<StreamPreferences>;
    const parsedFrameRate =
      parsed.frameRate === 15 || parsed.frameRate === 60
        ? parsed.frameRate
        : 30;

    return {
      frameRate: parsedFrameRate,
      captureSystemAudio: Boolean(parsed.captureSystemAudio),
    };
  } catch {
    return {
      frameRate: 30,
      captureSystemAudio: false,
    };
  }
};

const getNetworkSnapshot = (): Pick<
  AudioConnectionSnapshot,
  "networkType" | "networkRttMs" | "downlinkMbps"
> => {
  if (typeof navigator === "undefined") {
    return {
      networkType: null,
      networkRttMs: null,
      downlinkMbps: null,
    };
  }

  const navigatorWithConnection = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };

  const connection =
    navigatorWithConnection.connection ??
    navigatorWithConnection.mozConnection ??
    navigatorWithConnection.webkitConnection;

  const networkRttMs =
    typeof connection?.rtt === "number" && Number.isFinite(connection.rtt)
      ? Math.round(connection.rtt)
      : null;

  const downlinkMbps =
    typeof connection?.downlink === "number" &&
    Number.isFinite(connection.downlink)
      ? Number(connection.downlink.toFixed(1))
      : null;

  return {
    networkType: connection?.effectiveType ?? null,
    networkRttMs,
    downlinkMbps,
  };
};

const createIdleAudioSnapshot = (): AudioConnectionSnapshot => {
  return {
    statusText: "Ses bağlantısı: Lobiye bağlı değil",
    tone: "idle",
    pingMs: null,
    packetLossPct: null,
    jitterMs: null,
    successfulSamples: 0,
    failedSamples: 0,
    lastMeasuredAt: null,
    ...getNetworkSnapshot(),
  };
};

const stopMediaStreamTracks = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
};

function WorkspaceShell({
  currentUserId,
  currentUsername,
  currentUserRole,
  currentUserCreatedAt,
  onLogout,
  isLoggingOut,
}: WorkspaceShellProps) {
  const workspaceSection = useUiStore((state) => state.workspaceSection);
  const settingsSection = useUiStore((state) => state.settingsSection);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setStatus = useUiStore((state) => state.setStatus);

  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [renamingLobbyId, setRenamingLobbyId] = useState<string | null>(null);
  const [deletingLobbyId, setDeletingLobbyId] = useState<string | null>(null);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [isLeavingLobby, setIsLeavingLobby] = useState(false);

  const [cameraPreferences, setCameraPreferences] = useState<CameraPreferences>(
    readCameraPreferences,
  );
  const [audioPreferences, setAudioPreferences] =
    useState<AudioPreferences>(readAudioPreferences);
  const [streamPreferences, setStreamPreferences] = useState<StreamPreferences>(
    readStreamPreferences,
  );

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
  const [selectedScreenShareQuality, setSelectedScreenShareQuality] =
    useState<ScreenShareQualityPreset>(() =>
      getDefaultScreenShareQuality(readStreamPreferences().frameRate),
    );
  const [audioConnection, setAudioConnection] =
    useState<AudioConnectionSnapshot>(createIdleAudioSnapshot);
  const [remoteParticipantStreams, setRemoteParticipantStreams] =
    useState<ParticipantMediaMap>({});
  const activeLobbyRef = useRef<string | null>(null);
  const workspaceSectionRef = useRef(workspaceSection);
  const lobbyStreamReconnectTimerRef = useRef<number | null>(null);
  const lobbyStreamReconnectAttemptRef = useRef(0);
  const activeLobbyReconnectTimerRef = useRef<number | null>(null);
  const activeLobbyReconnectAttemptRef = useRef(0);
  const activeLobbyReconnectInFlightRef = useRef(false);
  const joiningLobbyRef = useRef<string | null>(null);
  const leavingLobbyRef = useRef(false);
  const onlineRef = useRef(isBrowserOnline());
  const reconnectStatusAtRef = useRef<Record<ReconnectStatusKey, number>>({
    network: 0,
    lobbyStream: 0,
    activeLobby: 0,
    livekit: 0,
  });
  const observedLobbyIdRef = useRef<string | null>(null);
  const previousLobbyMembersRef = useRef<Map<string, LobbyStateMember>>(
    new Map(),
  );
  const liveKitSessionRef = useRef<LiveKitMediaSession | null>(null);

  const shouldEmitReconnectStatus = (
    key: ReconnectStatusKey,
    cooldownMs: number,
  ): boolean => {
    const now = Date.now();
    const previous = reconnectStatusAtRef.current[key];
    if (now - previous < cooldownMs) {
      return false;
    }

    reconnectStatusAtRef.current[key] = now;
    return true;
  };

  useEffect(() => {
    soundCueService.configure({
      enabled: audioPreferences.notificationSoundsEnabled,
    });
  }, [audioPreferences.notificationSoundsEnabled]);

  useEffect(() => {
    const session = new LiveKitMediaSession({
      onRemoteStreamsChanged: (nextStreams) => {
        setRemoteParticipantStreams(nextStreams);
      },
      onConnectionStateChanged: (state) => {
        if (state === "reconnecting") {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus("LiveKit bağlantısı yeniden kuruluyor...", "warn");
          }
          return;
        }

        if (state === "disconnected" && activeLobbyRef.current) {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus(
              "Canlı ses bağlantısı koptu, yeniden bağlanılıyor...",
              "warn",
            );
          }
          scheduleActiveLobbyReconnect("livekit-disconnected", true);
        }
      },
      onWarning: (message) => {
        setStatus(message, "warn");
      },
    });

    liveKitSessionRef.current = session;

    return () => {
      liveKitSessionRef.current = null;
      void session.disconnect();
    };
  }, [setStatus]);

  const {
    usersQuery,
    userSearch,
    setUserSearch,
    userFilter,
    setUserFilter,
    selectedUserId,
    setSelectedUserId,
    filteredUsers,
    selectedUser,
  } = useWorkspaceUsers({
    currentUsername,
    workspaceSection,
  });

  const directMessagePeerUserIds = useMemo(() => {
    if (!usersQuery.data?.ok || !usersQuery.data.data) {
      return [] as string[];
    }

    return usersQuery.data.data.users
      .map((user) => user.userId)
      .filter((userId) => userId !== currentUserId);
  }, [currentUserId, usersQuery.data]);

  const avatarByUserId = useMemo(() => {
    if (!usersQuery.data?.ok || !usersQuery.data.data) {
      return {} as Record<string, string | null | undefined>;
    }

    return usersQuery.data.data.users.reduce<
      Record<string, string | null | undefined>
    >((accumulator, user) => {
      accumulator[user.userId] = user.avatarUrl;
      return accumulator;
    }, {});
  }, [usersQuery.data]);

  const currentUserAvatarUrl = avatarByUserId[currentUserId] ?? null;

  const lobbiesQuery = useQuery({
    queryKey: ["workspace-lobbies"],
    queryFn: () => workspaceService.listLobbies(),
    enabled: workspaceSection === "lobbies",
    staleTime: 15_000,
  });

  const [knownLobbies, setKnownLobbies] = useState<LobbyDescriptor[]>([]);
  const [lobbyMembersById, setLobbyMembersById] = useState<
    Record<string, LobbyStateMember[]>
  >({});

  const lobbies = knownLobbies;

  const clearLobbyReconnectTimer = (): void => {
    if (lobbyStreamReconnectTimerRef.current !== null) {
      window.clearTimeout(lobbyStreamReconnectTimerRef.current);
      lobbyStreamReconnectTimerRef.current = null;
    }
  };

  const clearActiveLobbyReconnectTimer = (): void => {
    if (activeLobbyReconnectTimerRef.current !== null) {
      window.clearTimeout(activeLobbyReconnectTimerRef.current);
      activeLobbyReconnectTimerRef.current = null;
    }
  };

  const syncLobbiesFromFallback = async (): Promise<void> => {
    const [lobbiesResult, statesResult] = await Promise.all([
      workspaceService.listLobbies(),
      workspaceService.getLobbyStates(),
    ]);

    if (!lobbiesResult.ok || !lobbiesResult.data) {
      return;
    }

    const membersByLobby: Record<string, LobbyStateMember[]> = {};
    if (statesResult.ok && statesResult.data) {
      for (const lobbyState of statesResult.data.lobbies) {
        membersByLobby[lobbyState.lobbyId] = lobbyState.members;
      }

      setLobbyMembersById(membersByLobby);
    }

    const merged = lobbiesResult.data.lobbies.map((lobby) => {
      const members = membersByLobby[lobby.id];
      return {
        ...lobby,
        memberCount: members ? members.length : lobby.memberCount,
      };
    });

    setKnownLobbies(sortLobbiesWithMainFirst(merged));
  };

  const scheduleLobbyStreamReconnect = (immediate = false): void => {
    if (workspaceSectionRef.current !== "lobbies") {
      return;
    }

    if (lobbyStreamReconnectTimerRef.current !== null) {
      return;
    }

    const delay = immediate
      ? 0
      : withReconnectJitter(
          Math.min(
            LOBBY_STREAM_RECONNECT_MAX_MS,
            LOBBY_STREAM_RECONNECT_BASE_MS *
              2 **
                Math.min(
                  lobbyStreamReconnectAttemptRef.current,
                  RECONNECT_MAX_EXPONENT,
                ),
          ),
        );

    lobbyStreamReconnectTimerRef.current = window.setTimeout(() => {
      lobbyStreamReconnectTimerRef.current = null;

      if (workspaceSectionRef.current !== "lobbies") {
        return;
      }

      if (!onlineRef.current) {
        scheduleLobbyStreamReconnect();
        return;
      }

      void workspaceService.startLobbyStream().then((result) => {
        if (result.ok) {
          lobbyStreamReconnectAttemptRef.current = 0;
          return;
        }

        lobbyStreamReconnectAttemptRef.current += 1;
        void syncLobbiesFromFallback();
        scheduleLobbyStreamReconnect();
      });
    }, delay);
  };

  const scheduleActiveLobbyReconnect = (
    reason:
      | "network-online"
      | "lobby-stream-closed"
      | "lobby-state-probe"
      | "livekit-disconnected",
    immediate = false,
  ): void => {
    if (!activeLobbyRef.current) {
      return;
    }

    if (activeLobbyReconnectTimerRef.current !== null) {
      return;
    }

    const delay = immediate
      ? 0
      : withReconnectJitter(
          Math.min(
            ACTIVE_LOBBY_RECONNECT_MAX_MS,
            ACTIVE_LOBBY_RECONNECT_BASE_MS *
              2 **
                Math.min(
                  activeLobbyReconnectAttemptRef.current,
                  RECONNECT_MAX_EXPONENT,
                ),
          ),
        );

    activeLobbyReconnectTimerRef.current = window.setTimeout(() => {
      activeLobbyReconnectTimerRef.current = null;

      const targetLobbyID = activeLobbyRef.current;
      if (!targetLobbyID) {
        return;
      }

      if (joiningLobbyRef.current || leavingLobbyRef.current) {
        scheduleActiveLobbyReconnect(reason);
        return;
      }

      if (!onlineRef.current) {
        scheduleActiveLobbyReconnect(reason);
        return;
      }

      if (activeLobbyReconnectInFlightRef.current) {
        scheduleActiveLobbyReconnect(reason);
        return;
      }

      const attempt = activeLobbyReconnectAttemptRef.current;
      activeLobbyReconnectInFlightRef.current = true;

      void workspaceService
        .joinLobby({
          lobbyId: targetLobbyID,
        })
        .then(async (result) => {
          if (!result.ok) {
            const nextAttempt = attempt + 1;
            activeLobbyReconnectAttemptRef.current = nextAttempt;

            if (shouldEmitReconnectStatus("activeLobby", 10_000)) {
              setStatus(
                `Lobi bağlantısı geri yüklenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }

            scheduleActiveLobbyReconnect(reason);
            return;
          }

          await performPostJoinSynchronization(targetLobbyID);

          activeLobbyReconnectAttemptRef.current = 0;
          if (attempt > 0 || reason !== "lobby-state-probe") {
            setStatus("Lobi bağlantısı yeniden kuruldu", "ok");
          }

          void lobbiesQuery.refetch();
        })
        .catch((error: unknown) => {
          const nextAttempt = attempt + 1;
          activeLobbyReconnectAttemptRef.current = nextAttempt;

          if (shouldEmitReconnectStatus("activeLobby", 10_000)) {
            setStatus(
              `Lobi bağlantısı geri yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
              "warn",
            );
          }

          scheduleActiveLobbyReconnect(reason);
        })
        .finally(() => {
          activeLobbyReconnectInFlightRef.current = false;
        });
    }, delay);
  };

  useEffect(() => {
    if (!lobbiesQuery.data?.ok || !lobbiesQuery.data.data) {
      return;
    }

    const lobbiesFromQuery = lobbiesQuery.data.data.lobbies;

    setKnownLobbies((previous) => {
      const previousMap = new Map(previous.map((lobby) => [lobby.id, lobby]));
      const merged = lobbiesFromQuery.map((incomingLobby) => {
        const wsMembers = lobbyMembersById[incomingLobby.id];
        const existing = previousMap.get(incomingLobby.id);
        return {
          ...incomingLobby,
          memberCount:
            wsMembers?.length ??
            existing?.memberCount ??
            incomingLobby.memberCount,
        };
      });

      return sortLobbiesWithMainFirst(merged);
    });
  }, [lobbiesQuery.data, lobbyMembersById]);

  useEffect(() => {
    const unsubscribe = workspaceService.onLobbyStreamEvent((event) => {
      if (event.type === "lobbies-snapshot") {
        clearLobbyReconnectTimer();
        lobbyStreamReconnectAttemptRef.current = 0;

        const nextMembersById: Record<string, LobbyStateMember[]> = {};
        const nextLobbies: LobbyDescriptor[] = event.lobbies.map((snapshot) => {
          nextMembersById[snapshot.id] = snapshot.members;
          return {
            id: snapshot.id,
            name: snapshot.name,
            room: snapshot.room,
            createdAt: snapshot.createdAt,
            createdBy: snapshot.createdBy,
            memberCount: snapshot.memberCount,
          };
        });

        setKnownLobbies(sortLobbiesWithMainFirst(nextLobbies));
        setLobbyMembersById(nextMembersById);

        const currentActiveLobbyID = activeLobbyRef.current;
        if (
          currentActiveLobbyID &&
          !Object.prototype.hasOwnProperty.call(
            nextMembersById,
            currentActiveLobbyID,
          )
        ) {
          setActiveLobbyId(null);
        }

        return;
      }

      if (event.type === "system-error") {
        if (shouldEmitReconnectStatus("lobbyStream", 8_000)) {
          setStatus(`Lobi akışı hatası: ${event.message}`, "warn");
        }
        scheduleLobbyStreamReconnect();
        return;
      }

      if (event.type === "stream-status" && event.status === "connected") {
        clearLobbyReconnectTimer();
        lobbyStreamReconnectAttemptRef.current = 0;
        return;
      }

      if (event.type === "stream-status" && event.status === "closed") {
        if (shouldEmitReconnectStatus("lobbyStream", 8_000)) {
          setStatus(
            `Lobi akışı kapandı: ${event.detail ?? "bağlantı sonlandı"}`,
            "warn",
          );
        }

        void syncLobbiesFromFallback();
        scheduleLobbyStreamReconnect();
        if (activeLobbyRef.current) {
          scheduleActiveLobbyReconnect("lobby-stream-closed", true);
        }
      }
    });

    return () => {
      clearLobbyReconnectTimer();
      unsubscribe();
    };
  }, [setStatus]);

  useEffect(() => {
    workspaceSectionRef.current = workspaceSection;
  }, [workspaceSection]);

  useEffect(() => {
    joiningLobbyRef.current = joiningLobbyId;
  }, [joiningLobbyId]);

  useEffect(() => {
    leavingLobbyRef.current = isLeavingLobby;
  }, [isLeavingLobby]);

  useEffect(() => {
    const handleOnline = (): void => {
      if (onlineRef.current) {
        return;
      }

      onlineRef.current = true;

      if (workspaceSectionRef.current === "lobbies") {
        clearLobbyReconnectTimer();
        scheduleLobbyStreamReconnect(true);
      }

      if (activeLobbyRef.current) {
        if (shouldEmitReconnectStatus("network", 4_000)) {
          setStatus(
            "İnternet geri geldi, lobi bağlantısı yeniden kuruluyor...",
            "warn",
          );
        }
        clearActiveLobbyReconnectTimer();
        scheduleActiveLobbyReconnect("network-online", true);
      }
    };

    const handleOffline = (): void => {
      if (!onlineRef.current) {
        return;
      }

      onlineRef.current = false;
      if (shouldEmitReconnectStatus("network", 4_000)) {
        setStatus(
          "İnternet bağlantısı kesildi. Bağlantı geri geldiğinde otomatik yeniden denenecek.",
          "warn",
        );
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setStatus]);

  useEffect(() => {
    if (workspaceSection !== "lobbies") {
      clearLobbyReconnectTimer();
      lobbyStreamReconnectAttemptRef.current = 0;
      return;
    }

    let cancelled = false;
    void workspaceService.startLobbyStream().then((result) => {
      if (cancelled || result.ok) {
        if (result.ok) {
          lobbyStreamReconnectAttemptRef.current = 0;
        }
        return;
      }

      setStatus(
        `Lobi akışı başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        "error",
      );

      void syncLobbiesFromFallback();
      lobbyStreamReconnectAttemptRef.current += 1;
      scheduleLobbyStreamReconnect(true);
    });

    return () => {
      cancelled = true;
      clearLobbyReconnectTimer();
      lobbyStreamReconnectAttemptRef.current = 0;
      void workspaceService.stopLobbyStream();
    };
  }, [setStatus, workspaceSection]);

  const activeLobby = useMemo(() => {
    if (!activeLobbyId) {
      return null;
    }

    return lobbies.find((lobby) => lobby.id === activeLobbyId) ?? null;
  }, [activeLobbyId, lobbies]);

  const hasActiveLobby = activeLobbyId !== null;

  useEffect(() => {
    activeLobbyRef.current = activeLobbyId;
  }, [activeLobbyId]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(localCameraStream);
      stopMediaStreamTracks(localScreenStream);
    };
  }, [localCameraStream, localScreenStream]);

  const {
    directMessagesQuery,
    directMessages,
    messageDraft,
    setMessageDraft,
    isSendingMessage,
    handleSendMessage,
    handleDeleteMessage,
    deletingMessageId,
    unreadByPeerId,
  } = useDirectMessages({
    currentUserId,
    peerUserIds: directMessagePeerUserIds,
    selectedUserId,
    workspaceSection,
    setStatus,
  });

  const handleCopyUsername = async (username: string): Promise<void> => {
    try {
      if (!navigator?.clipboard) {
        throw new Error("Pano erişimi desteklenmiyor");
      }

      await navigator.clipboard.writeText(username);
      setStatus(`@${username} kullanıcı adı kopyalandı`, "ok");
    } catch (error) {
      setStatus(
        `Kopyalama başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "warn",
      );
    }
  };

  const sectionTitle = useMemo(() => {
    if (workspaceSection === "users") {
      return "Arkadaşlar";
    }

    if (workspaceSection === "settings") {
      return "Ayarlar";
    }

    return "Lobiler";
  }, [workspaceSection]);

  const createLobby = async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setStatus("Lobi adı en az 2 karakter olmalı", "warn");
      return false;
    }

    setIsCreatingLobby(true);
    try {
      const result = await workspaceService.createLobby({ name: trimmed });
      if (!result.ok) {
        setStatus(
          `Lobi oluşturulamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      if (result.data?.lobby) {
        const createdLobby = result.data.lobby;
        setKnownLobbies((previous) => {
          const existingIndex = previous.findIndex(
            (lobby) => lobby.id === createdLobby.id,
          );

          if (existingIndex >= 0) {
            const next = [...previous];
            next[existingIndex] = createdLobby;
            return next;
          }

          return [...previous, createdLobby];
        });
      }

      setStatus(`"${trimmed}" lobisi oluşturuldu`, "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setIsCreatingLobby(false);
    }
  };

  const {
    lobbyStateQuery,
    lobbyMessagesQuery,
    lobbyMembers,
    lobbyMessages,
    lobbyMessageDraft,
    setLobbyMessageDraft,
    sendLobbyMessage,
    deleteLobbyMessage,
    isSendingLobbyMessage,
    deletingLobbyMessageId,
    patchLobbyMemberState,
  } = useLobbyRoom({
    activeLobbyId,
    workspaceSection,
    setStatus,
  });

  useEffect(() => {
    if (!activeLobbyId) {
      observedLobbyIdRef.current = null;
      previousLobbyMembersRef.current = new Map();
      return;
    }

    const currentMembers = new Map<string, LobbyStateMember>(
      lobbyMembers.map((member) => [member.userId, member]),
    );

    if (observedLobbyIdRef.current !== activeLobbyId) {
      observedLobbyIdRef.current = activeLobbyId;
      previousLobbyMembersRef.current = currentMembers;
      return;
    }

    const previousMembers = previousLobbyMembersRef.current;
    for (const [userId, member] of currentMembers) {
      const previousMember = previousMembers.get(userId);

      if (!previousMember) {
        if (userId !== currentUserId) {
          soundCueService.playMemberJoined();
        }
        continue;
      }

      if (userId === currentUserId) {
        continue;
      }

      if (!previousMember.cameraEnabled && member.cameraEnabled) {
        soundCueService.playCameraEnabled();
      }

      if (!previousMember.screenSharing && member.screenSharing) {
        soundCueService.playScreenEnabled();
      }
    }

    for (const [userId] of previousMembers) {
      if (!currentMembers.has(userId) && userId !== currentUserId) {
        soundCueService.playMemberLeft();
      }
    }

    previousLobbyMembersRef.current = currentMembers;
  }, [activeLobbyId, currentUserId, lobbyMembers]);

  const renameLobby = async (
    lobbyId: string,
    nextName: string,
  ): Promise<boolean> => {
    const trimmedName = nextName.trim();
    if (trimmedName.length < 2) {
      setStatus("Lobi adı en az 2 karakter olmalı", "warn");
      return false;
    }

    setRenamingLobbyId(lobbyId);
    try {
      const result = await workspaceService.updateLobby({
        lobbyId,
        name: trimmedName,
      });

      if (!result.ok) {
        setStatus(
          `Lobi güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      if (result.data?.lobby) {
        const updatedLobby = result.data.lobby;
        setKnownLobbies((previous) => {
          return previous.map((lobby) => {
            if (lobby.id !== updatedLobby.id) {
              return lobby;
            }

            return updatedLobby;
          });
        });
      }

      setStatus("Lobi adı güncellendi", "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setRenamingLobbyId(null);
    }
  };

  const deleteLobby = async (lobbyId: string): Promise<boolean> => {
    setDeletingLobbyId(lobbyId);
    try {
      const result = await workspaceService.deleteLobby({ lobbyId });
      if (!result.ok) {
        setStatus(
          `Lobi silinemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      setKnownLobbies((previous) => {
        return previous.filter((lobby) => lobby.id !== lobbyId);
      });

      if (activeLobbyId === lobbyId) {
        setActiveLobbyId(null);
      }

      setStatus("Lobi silindi", "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setDeletingLobbyId(null);
    }
  };

  const syncLobbyAudioState = async (lobbyId: string): Promise<void> => {
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
                `Mikrofon durumu uygulanamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
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
                `Kulaklık durumu uygulanamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          }),
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const syncLobbyMediaState = async (lobbyId: string): Promise<void> => {
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
                `Kamera durumu uygulanamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
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
                `Yayın durumu uygulanamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          }),
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const performPostJoinSynchronization = async (
    lobbyId: string,
  ): Promise<void> => {
    const liveKitTask = (async () => {
      try {
        await liveKitSessionRef.current?.connect(lobbyId);
        await liveKitSessionRef.current?.setMicrophoneEnabled(micEnabled);
      } catch (error) {
        setStatus(
          `LiveKit bağlantısı kurulamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
          "warn",
        );
      }
    })();

    await Promise.all([
      liveKitTask,
      syncLobbyAudioState(lobbyId),
      syncLobbyMediaState(lobbyId),
    ]);
  };

  const saveCameraPreferences = (next: CameraPreferences): void => {
    setCameraPreferences(next);
    localStorage.setItem(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  };

  const saveAudioPreferences = (next: AudioPreferences): void => {
    setAudioPreferences(next);
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next));

    setMicEnabled(next.defaultMicEnabled);
    setHeadphoneEnabled(next.defaultHeadphoneEnabled);

    if (!activeLobbyId) {
      return;
    }

    patchLobbyMemberState(currentUserId, {
      muted: !next.defaultMicEnabled,
      speaking: false,
      deafened: !next.defaultHeadphoneEnabled,
    });

    void workspaceService.setLobbyMuted({
      lobbyId: activeLobbyId,
      muted: !next.defaultMicEnabled,
    });

    void workspaceService.setLobbyDeafened({
      lobbyId: activeLobbyId,
      deafened: !next.defaultHeadphoneEnabled,
    });

    void liveKitSessionRef.current?.setMicrophoneEnabled(
      next.defaultMicEnabled,
    );
  };

  const saveStreamPreferences = (next: StreamPreferences): void => {
    setStreamPreferences(next);
    localStorage.setItem(STREAM_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  };

  const resetLocalMediaCapture = (): void => {
    stopMediaStreamTracks(localCameraStream);
    stopMediaStreamTracks(localScreenStream);
    void liveKitSessionRef.current?.unpublishCamera();
    void liveKitSessionRef.current?.unpublishScreen();
    setLocalCameraStream(null);
    setLocalScreenStream(null);
    setCameraEnabled(false);
    setScreenEnabled(false);
  };

  useEffect(() => {
    if (activeLobbyId !== null) {
      return;
    }

    clearActiveLobbyReconnectTimer();
    activeLobbyReconnectAttemptRef.current = 0;
    activeLobbyReconnectInFlightRef.current = false;
    void liveKitSessionRef.current?.disconnect();
    resetLocalMediaCapture();
  }, [activeLobbyId]);

  useEffect(() => {
    return () => {
      clearActiveLobbyReconnectTimer();
    };
  }, []);

  useEffect(() => {
    if (!activeLobbyId) {
      setAudioConnection(createIdleAudioSnapshot());
      return;
    }

    let disposed = false;
    let probeTimerId: number | null = null;
    let successfulSamples = 0;
    let failedSamples = 0;
    let consecutiveFailures = 0;
    let smoothedPingMs: number | null = null;
    const recentPings: number[] = [];
    const recentOutcomes: boolean[] = [];

    const pushOutcome = (success: boolean): void => {
      recentOutcomes.push(success);
      if (recentOutcomes.length > AUDIO_SAMPLE_LIMIT) {
        recentOutcomes.shift();
      }
    };

    const scheduleNextProbe = (): void => {
      if (disposed) {
        return;
      }

      let nextDelay = AUDIO_PROBE_STABLE_INTERVAL_MS;
      if (consecutiveFailures >= 2) {
        nextDelay = AUDIO_PROBE_FAILURE_INTERVAL_MS;
      } else if (consecutiveFailures === 1) {
        nextDelay = AUDIO_PROBE_DEGRADED_INTERVAL_MS;
      }

      if (smoothedPingMs !== null && smoothedPingMs >= 220) {
        nextDelay = Math.min(nextDelay, AUDIO_PROBE_DEGRADED_INTERVAL_MS);
      }

      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        nextDelay = Math.max(nextDelay, AUDIO_PROBE_BACKGROUND_INTERVAL_MS);
      }

      probeTimerId = window.setTimeout(() => {
        void runProbe();
      }, nextDelay);
    };

    const publishSnapshot = (
      latestPingMs: number | null,
      measuredAt: string,
    ): void => {
      const totalSamples = recentOutcomes.length;
      const failedInWindow = recentOutcomes.reduce((sum, outcome) => {
        return sum + (outcome ? 0 : 1);
      }, 0);
      const packetLossPct =
        totalSamples > 0
          ? Number(((failedInWindow / totalSamples) * 100).toFixed(1))
          : null;

      const effectivePingMs =
        smoothedPingMs !== null
          ? smoothedPingMs
          : recentPings.length > 0
            ? recentPings[recentPings.length - 1]
            : latestPingMs;

      const jitterMs =
        recentPings.length > 1
          ? Math.round(
              recentPings.slice(1).reduce((sum, ping, index) => {
                return sum + Math.abs(ping - recentPings[index]);
              }, 0) /
                (recentPings.length - 1),
            )
          : null;

      let tone: AudioConnectionTone = "ok";
      let statusText = "Ses bağlantısı iyi";

      if (successfulSamples === 0 && failedSamples > 0) {
        tone = "error";
        statusText = "Ses bağlantısı yok";
      } else if (
        (packetLossPct !== null && packetLossPct >= 20) ||
        (effectivePingMs !== null && effectivePingMs >= 350)
      ) {
        tone = "error";
        statusText = "Ses bağlantısı sorunlu";
      } else if (
        (packetLossPct !== null && packetLossPct >= 8) ||
        (effectivePingMs !== null && effectivePingMs >= 180) ||
        (jitterMs !== null && jitterMs >= 55)
      ) {
        tone = "warn";
        statusText = "Ses bağlantısı zayıf";
      }

      if (totalSamples < 2 && tone !== "error") {
        statusText = "Ses bağlantısı ölçülüyor";
      }

      setAudioConnection({
        statusText,
        tone,
        pingMs:
          effectivePingMs === null
            ? null
            : Math.max(1, Math.round(effectivePingMs)),
        packetLossPct,
        jitterMs,
        successfulSamples,
        failedSamples,
        lastMeasuredAt: measuredAt,
        ...getNetworkSnapshot(),
      });
    };

    const runProbe = async (): Promise<void> => {
      if (disposed) {
        return;
      }

      const startedAt = performance.now();
      const timeoutToken = Symbol("audio-probe-timeout");
      const resultOrTimeout = await Promise.race([
        workspaceService.getLobbyState({
          lobbyId: activeLobbyId,
        }),
        new Promise<typeof timeoutToken>((resolve) => {
          window.setTimeout(() => {
            resolve(timeoutToken);
          }, AUDIO_PROBE_TIMEOUT_MS);
        }),
      ]);

      if (disposed) {
        return;
      }

      if (resultOrTimeout !== timeoutToken && resultOrTimeout.ok) {
        const pingMs = Math.max(1, Math.round(performance.now() - startedAt));
        const measuredAt = new Date().toISOString();
        successfulSamples += 1;
        consecutiveFailures = 0;
        pushOutcome(true);

        smoothedPingMs =
          smoothedPingMs === null
            ? pingMs
            : smoothedPingMs * (1 - AUDIO_PING_EMA_ALPHA) +
              pingMs * AUDIO_PING_EMA_ALPHA;

        recentPings.push(pingMs);
        if (recentPings.length > AUDIO_SAMPLE_LIMIT) {
          recentPings.shift();
        }

        publishSnapshot(smoothedPingMs, measuredAt);
        scheduleNextProbe();
        return;
      }

      failedSamples += 1;
      consecutiveFailures += 1;
      pushOutcome(false);
      const measuredAt = new Date().toISOString();
      publishSnapshot(smoothedPingMs, measuredAt);
      scheduleActiveLobbyReconnect("lobby-state-probe");
      scheduleNextProbe();
    };

    void runProbe();

    return () => {
      disposed = true;
      if (probeTimerId !== null) {
        window.clearTimeout(probeTimerId);
        probeTimerId = null;
      }
    };
  }, [activeLobbyId]);

  const joinLobby = async (lobbyId: string): Promise<void> => {
    if (joiningLobbyId || isLeavingLobby || activeLobbyId === lobbyId) {
      return;
    }

    soundCueService.prime();

    setJoiningLobbyId(lobbyId);
    try {
      const result = await workspaceService.joinLobby({ lobbyId });
      if (!result.ok) {
        setStatus(
          `Lobiye katılınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return;
      }

      setActiveLobbyId(lobbyId);
      clearActiveLobbyReconnectTimer();
      activeLobbyReconnectAttemptRef.current = 0;
      activeLobbyReconnectInFlightRef.current = false;

      void performPostJoinSynchronization(lobbyId);

      soundCueService.playMemberJoined();

      const joinedLobby = lobbies.find((item) => item.id === lobbyId);
      setStatus(`${joinedLobby?.name ?? lobbyId} lobisine katıldın`, "ok");
      void lobbiesQuery.refetch();
    } finally {
      setJoiningLobbyId(null);
    }
  };

  const leaveActiveLobby = async (): Promise<void> => {
    if (!activeLobbyId || isLeavingLobby) {
      return;
    }

    soundCueService.prime();

    setIsLeavingLobby(true);
    clearActiveLobbyReconnectTimer();
    activeLobbyReconnectAttemptRef.current = 0;
    activeLobbyReconnectInFlightRef.current = false;
    try {
      const leavingLobbyId = activeLobbyId;
      const result = await workspaceService.leaveLobby({
        lobbyId: leavingLobbyId,
      });
      if (!result.ok) {
        setStatus(
          `Lobiden ayrılınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return;
      }

      setActiveLobbyId(null);
      resetLocalMediaCapture();
      void liveKitSessionRef.current?.disconnect();
      soundCueService.playMemberLeft();
      setStatus("Lobiden ayrıldın", "ok");
      void lobbiesQuery.refetch();
    } finally {
      setIsLeavingLobby(false);
    }
  };

  const handleMicToggle = (): void => {
    setMicEnabled((previous) => {
      const next = !previous;
      soundCueService.playMicToggle(next);

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
              `Mikrofon yayını güncellenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
              "warn",
            );
          });

        void workspaceService
          .setLobbyMuted({ lobbyId: activeLobbyId, muted: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Mikrofon durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          });
      }

      return next;
    });
  };

  const handleHeadphoneToggle = (): void => {
    setHeadphoneEnabled((previous) => {
      const next = !previous;
      soundCueService.playHeadphoneToggle(next);

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
                `Kulaklık durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn",
              );
            }
          });
      }

      return next;
    });
  };

  const handleCameraToggle = (): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Kamerayı açmak için önce bir lobiye katıl", "warn");
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
              `Kamera durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn",
            );
          }
        });

      return;
    }

    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          width: {
            ideal: cameraPreferences.resolution === "1080p" ? 1920 : 1280,
          },
          height: {
            ideal: cameraPreferences.resolution === "1080p" ? 1080 : 720,
          },
          frameRate: {
            ideal: cameraPreferences.frameRate,
            max: cameraPreferences.frameRate,
          },
        },
      })
      .then(async (stream) => {
        try {
          await liveKitSessionRef.current?.publishCameraStream(stream);
        } catch (error) {
          stopMediaStreamTracks(stream);
          throw error;
        }

        setLocalCameraStream(stream);
        setCameraEnabled(true);
        patchLobbyMemberState(currentUserId, {
          cameraEnabled: true,
        });

        return workspaceService.setLobbyCameraEnabled({
          lobbyId,
          enabled: true,
        });
      })
      .then((result) => {
        if (!result.ok) {
          setStatus(
            `Kamera durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn",
          );
        }
      })
      .catch((error: unknown) => {
        setStatus(
          `Kamera başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
          "error",
        );
      });
  };

  const loadScreenShareSources = async (): Promise<void> => {
    setIsLoadingScreenShareSources(true);
    setScreenShareModalError(null);

    const result = await workspaceService.listScreenCaptureSources();
    if (!result.ok || !result.data) {
      setScreenShareSources([]);
      setSelectedScreenShareSourceId(null);
      setScreenShareModalError(
        result.error?.message ?? "Yayın kaynakları alınamadı",
      );
      setIsLoadingScreenShareSources(false);
      return;
    }

    const sources = result.data.sources;
    setScreenShareSources(sources);

    setSelectedScreenShareSourceId((previous) => {
      if (previous && sources.some((source) => source.id === previous)) {
        return previous;
      }

      const preferred =
        sources.find((source) => source.kind === "screen") ?? sources[0];

      return preferred?.id ?? null;
    });

    setIsLoadingScreenShareSources(false);
  };

  const closeScreenShareModal = (): void => {
    if (isStartingScreenShare) {
      return;
    }

    setIsScreenShareModalOpen(false);
    setScreenShareModalError(null);
  };

  const openScreenShareModal = (): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylaşımı için önce bir lobiye katıl", "warn");
      return;
    }

    setSelectedScreenShareQuality(
      getDefaultScreenShareQuality(streamPreferences.frameRate),
    );
    setIsScreenShareModalOpen(true);
    void loadScreenShareSources();
  };

  const startScreenShareFromModal = async (): Promise<void> => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylaşımı için önce bir lobiye katıl", "warn");
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
        setStatus(`Yayın başlatıldı: ${sourceName}`, "ok");
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
          `Yayın durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }

      setIsScreenShareModalOpen(false);
    } catch (error) {
      setStatus(
        `Ekran paylaşımı başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    } finally {
      setIsStartingScreenShare(false);
    }
  };

  const handleScreenToggle = (): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylaşımı için önce bir lobiye katıl", "warn");
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
              `Yayın durumu güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn",
            );
          }
        });

      return;
    }

    openScreenShareModal();
  };

  return (
    <section className="ct-workspace-shell" aria-label="Çalışma alanı">
      <WorkspaceRail
        workspaceSection={workspaceSection}
        onSectionChange={setWorkspaceSection}
      />

      <WorkspaceSidebar
        sectionTitle={sectionTitle}
        workspaceSection={workspaceSection}
        usersProps={{
          usersQuery,
          userSearch,
          setUserSearch,
          userFilter,
          setUserFilter,
          filteredUsers,
          selectedUserId,
          setSelectedUserId,
          unreadByUserId: unreadByPeerId,
        }}
        lobbiesProps={{
          lobbiesQuery,
          lobbies,
          lobbyMembersById,
          avatarByUserId,
          activeLobbyId,
          joiningLobbyId,
          onJoinLobby: joinLobby,
          onCreateLobby: createLobby,
          onRenameLobby: renameLobby,
          onDeleteLobby: deleteLobby,
          isCreatingLobby,
          renamingLobbyId,
          deletingLobbyId,
        }}
        settingsProps={{
          settingsSection,
          setSettingsSection,
        }}
        quickControlsProps={{
          currentUsername,
          currentUserAvatarUrl,
          hasActiveLobby,
          isLeavingLobby,
          micEnabled,
          headphoneEnabled,
          onToggleMic: handleMicToggle,
          onToggleHeadphone: handleHeadphoneToggle,
          onDisconnect: leaveActiveLobby,
        }}
        audioConnectionProps={audioConnection}
      />

      <WorkspaceMainPanel
        sectionTitle={sectionTitle}
        currentUsername={currentUsername}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        currentUserCreatedAt={currentUserCreatedAt}
        onLogout={onLogout}
        isLoggingOut={isLoggingOut}
        cameraPreferences={cameraPreferences}
        audioPreferences={audioPreferences}
        streamPreferences={streamPreferences}
        onSaveCameraPreferences={saveCameraPreferences}
        onSaveAudioPreferences={saveAudioPreferences}
        onSaveStreamPreferences={saveStreamPreferences}
        micEnabled={micEnabled}
        headphoneEnabled={headphoneEnabled}
        cameraEnabled={cameraEnabled}
        screenEnabled={screenEnabled}
        localCameraStream={localCameraStream}
        localScreenStream={localScreenStream}
        remoteParticipantStreams={remoteParticipantStreams}
        avatarByUserId={avatarByUserId}
        workspaceSection={workspaceSection}
        settingsSection={settingsSection}
        lobbies={lobbies}
        activeLobbyId={activeLobbyId}
        activeLobbyName={activeLobby?.name ?? null}
        joiningLobbyId={joiningLobbyId}
        onJoinLobby={joinLobby}
        lobbyStateQuery={lobbyStateQuery}
        lobbyMessagesQuery={lobbyMessagesQuery}
        lobbyMembers={lobbyMembers}
        lobbyMessages={lobbyMessages}
        lobbyMessageDraft={lobbyMessageDraft}
        setLobbyMessageDraft={setLobbyMessageDraft}
        onSendLobbyMessage={sendLobbyMessage}
        onDeleteLobbyMessage={deleteLobbyMessage}
        isSendingLobbyMessage={isSendingLobbyMessage}
        deletingLobbyMessageId={deletingLobbyMessageId}
        isLeavingLobby={isLeavingLobby}
        onToggleMic={handleMicToggle}
        onToggleHeadphone={handleHeadphoneToggle}
        onToggleScreen={handleScreenToggle}
        onToggleCamera={handleCameraToggle}
        onLeaveLobby={leaveActiveLobby}
        selectedUser={selectedUser}
        onCopyUsername={handleCopyUsername}
        directMessagesProps={{
          directMessagesQuery,
          directMessages,
          messageDraft,
          setMessageDraft,
          isSendingMessage,
          sendDirectMessage: handleSendMessage,
          deleteDirectMessage: handleDeleteMessage,
          deletingDirectMessageId: deletingMessageId,
        }}
      />

      {isScreenShareModalOpen && (
        <div
          className="ct-user-popup-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Yayın kaynağı seç"
          onClick={closeScreenShareModal}
        >
          <section
            className="ct-user-popup ct-screen-share-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ct-user-popup-header">
              <h4>Yayın Başlat</h4>
              <p>Monitör veya pencere seçip kalite profilini belirle.</p>
            </header>

            <div className="ct-screen-share-grid">
              <div className="ct-screen-share-column">
                <h5>Kaynak</h5>

                {isLoadingScreenShareSources && (
                  <div className="ct-list-state">Kaynaklar yükleniyor...</div>
                )}

                {!isLoadingScreenShareSources &&
                  screenShareSources.length === 0 && (
                    <div className="ct-list-state error">
                      {screenShareModalError ??
                        "Paylaşılabilir kaynak bulunamadı."}
                    </div>
                  )}

                {!isLoadingScreenShareSources &&
                  screenShareSources.length > 0 && (
                    <div className="ct-screen-share-source-list">
                      {screenShareSources.map((source) => (
                        <label
                          key={source.id}
                          className={`ct-screen-share-source ${selectedScreenShareSourceId === source.id ? "active" : ""}`}
                          htmlFor={`screen-source-${source.id}`}
                        >
                          <input
                            id={`screen-source-${source.id}`}
                            type="radio"
                            name="screen-share-source"
                            checked={selectedScreenShareSourceId === source.id}
                            onChange={() =>
                              setSelectedScreenShareSourceId(source.id)
                            }
                          />
                          <div>
                            <strong>{source.name}</strong>
                            <span>
                              {source.kind === "screen" ? "Monitör" : "Pencere"}
                              {source.displayId
                                ? ` • Ekran ${source.displayId}`
                                : ""}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
              </div>

              <div className="ct-screen-share-column">
                <h5>Kalite</h5>
                <div className="ct-screen-share-quality-list">
                  {SCREEN_SHARE_QUALITY_OPTIONS.map((qualityOption) => (
                    <label
                      key={qualityOption.id}
                      className={`ct-screen-share-quality ${selectedScreenShareQuality === qualityOption.id ? "active" : ""}`}
                      htmlFor={`screen-quality-${qualityOption.id}`}
                    >
                      <input
                        id={`screen-quality-${qualityOption.id}`}
                        type="radio"
                        name="screen-share-quality"
                        checked={
                          selectedScreenShareQuality === qualityOption.id
                        }
                        onChange={() =>
                          setSelectedScreenShareQuality(qualityOption.id)
                        }
                      />
                      <div>
                        <strong>{qualityOption.label}</strong>
                        <span>{qualityOption.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {screenShareModalError && screenShareSources.length > 0 && (
              <p className="ct-list-state error">{screenShareModalError}</p>
            )}

            <div className="ct-action-row">
              <button
                type="button"
                className="ct-btn-primary"
                onClick={() => {
                  void startScreenShareFromModal();
                }}
                disabled={
                  isStartingScreenShare ||
                  isLoadingScreenShareSources ||
                  screenShareSources.length === 0
                }
              >
                {isStartingScreenShare
                  ? "Yayın Başlatılıyor..."
                  : "Yayını Başlat"}
              </button>
              <button
                type="button"
                className="ct-btn-secondary"
                onClick={() => {
                  void loadScreenShareSources();
                }}
                disabled={isLoadingScreenShareSources || isStartingScreenShare}
              >
                Kaynakları Yenile
              </button>
              <button
                type="button"
                className="ct-btn-secondary"
                onClick={closeScreenShareModal}
                disabled={isStartingScreenShare}
              >
                İptal
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default WorkspaceShell;
