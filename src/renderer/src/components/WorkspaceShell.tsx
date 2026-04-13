import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LobbyDescriptor, UserRole } from "../../../shared/auth-contracts";
import type { LobbyStateMember } from "../../../shared/desktop-api-types";
import {
  CameraShareModal,
  ScreenShareModal,
  WorkspaceMainPanel,
  WorkspaceRail,
  WorkspaceSidebar,
} from "../features/workspace/components";
import { useDirectMessages } from "../features/workspace/hooks/use-direct-messages";
import { useWorkspaceAudioConnection } from "../features/workspace/hooks/use-workspace-audio-connection";
import { useWorkspaceLobbyActions } from "../features/workspace/hooks/use-workspace-lobby-actions";
import { useLobbyRoom } from "../features/workspace/hooks/use-lobby-room";
import { useWorkspaceMediaControls } from "../features/workspace/hooks/use-workspace-media-controls";
import { useWorkspaceUsers } from "../features/workspace/hooks/use-workspace-users";
import type {
  AudioPreferences,
  CameraPreferences,
  StreamPreferences,
} from "../features/workspace/components/settings/settings-main-panel-types";
import {
  readAudioPreferences,
  readCameraPreferences,
  readStreamPreferences,
  saveAudioPreferences as persistAudioPreferences,
  saveCameraPreferences as persistCameraPreferences,
  saveStreamPreferences as persistStreamPreferences,
  SCREEN_SHARE_QUALITY_OPTIONS,
} from "../features/workspace/workspace-media-utils";
import {
  LiveKitMediaSession,
  type ParticipantMediaMap,
} from "../services/livekit-stream-manager";
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

type ReconnectStatusKey = "network" | "lobbyStream" | "activeLobby" | "livekit";
const LOBBY_STREAM_RECONNECT_BASE_MS = 1_000;
const LOBBY_STREAM_RECONNECT_MAX_MS = 10_000;
const ACTIVE_LOBBY_RECONNECT_BASE_MS = 1_200;
const ACTIVE_LOBBY_RECONNECT_MAX_MS = 15_000;
const RECONNECT_MAX_EXPONENT = 5;
const RECONNECT_JITTER_MAX_MS = 450;

const isBrowserOnline = (): boolean => {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
};

const withReconnectJitter = (delayMs: number): number => {
  return delayMs + Math.floor(Math.random() * RECONNECT_JITTER_MAX_MS);
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

  const [cameraPreferences, setCameraPreferences] = useState<CameraPreferences>(
    readCameraPreferences,
  );
  const [audioPreferences, setAudioPreferences] =
    useState<AudioPreferences>(readAudioPreferences);
  const [streamPreferences, setStreamPreferences] = useState<StreamPreferences>(
    readStreamPreferences,
  );

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

    session.setAudioProcessingPreferences({
      enhancedNoiseSuppressionEnabled:
        readAudioPreferences().enhancedNoiseSuppressionEnabled,
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

  const {
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
  } = useWorkspaceMediaControls({
    currentUserId,
    activeLobbyRef,
    liveKitSessionRef,
    cameraPreferences,
    streamPreferences,
    setStatus,
    patchLobbyMemberState,
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

  const {
    isCreatingLobby,
    renamingLobbyId,
    deletingLobbyId,
    joiningLobbyId,
    isLeavingLobby,
    createLobby,
    renameLobby,
    deleteLobby,
    joinLobby,
    leaveActiveLobby,
  } = useWorkspaceLobbyActions({
    activeLobbyId,
    setActiveLobbyId,
    currentUserId,
    lobbies,
    lobbiesQuery,
    setKnownLobbies,
    setStatus,
    performPostJoinSynchronization,
    clearActiveLobbyReconnectTimer,
    activeLobbyReconnectAttemptRef,
    activeLobbyReconnectInFlightRef,
    resetLocalMediaCapture,
    liveKitSessionRef,
  });

  useEffect(() => {
    joiningLobbyRef.current = joiningLobbyId;
  }, [joiningLobbyId]);

  useEffect(() => {
    leavingLobbyRef.current = isLeavingLobby;
  }, [isLeavingLobby]);

  const saveCameraPreferences = (next: CameraPreferences): void => {
    setCameraPreferences(next);
    persistCameraPreferences(next);
  };

  const saveAudioPreferences = (next: AudioPreferences): void => {
    const shouldRefreshMicProcessing =
      next.defaultMicEnabled &&
      next.enhancedNoiseSuppressionEnabled !==
        audioPreferences.enhancedNoiseSuppressionEnabled;

    setAudioPreferences(next);
    persistAudioPreferences(next);

    liveKitSessionRef.current?.setAudioProcessingPreferences({
      enhancedNoiseSuppressionEnabled: next.enhancedNoiseSuppressionEnabled,
    });

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

    if (shouldRefreshMicProcessing) {
      void liveKitSessionRef.current
        ?.refreshMicrophoneProcessing()
        .catch(() => {
          setStatus(
            "Mikrofon işleme zinciri yenilenemedi, ayar bir sonraki bağlantıda uygulanacak.",
            "warn",
          );
        });
    }
  };

  const handleToggleEnhancedNoiseSuppression = (): void => {
    const nextEnabled = !audioPreferences.enhancedNoiseSuppressionEnabled;
    const nextPreferences: AudioPreferences = {
      ...audioPreferences,
      enhancedNoiseSuppressionEnabled: nextEnabled,
    };

    setAudioPreferences(nextPreferences);
    persistAudioPreferences(nextPreferences);

    liveKitSessionRef.current?.setAudioProcessingPreferences({
      enhancedNoiseSuppressionEnabled: nextEnabled,
    });

    const hasActiveMicSession = Boolean(activeLobbyId) && micEnabled;
    if (hasActiveMicSession) {
      void liveKitSessionRef.current
        ?.refreshMicrophoneProcessing()
        .then(() => {
          setStatus(
            nextEnabled
              ? "RNNoise gürültü bastırma etkinleştirildi."
              : "RNNoise gürültü bastırma kapatıldı.",
            "ok",
          );
        })
        .catch(() => {
          setStatus(
            "Mikrofon işleme zinciri yenilenemedi, ayar bir sonraki bağlantıda uygulanacak.",
            "warn",
          );
        });
      return;
    }

    setStatus(
      nextEnabled
        ? "RNNoise gürültü bastırma kaydedildi. Bir sonraki mikrofon açılışında uygulanacak."
        : "RNNoise gürültü bastırma kapatıldı. Bir sonraki mikrofon açılışında uygulanacak.",
      "ok",
    );
  };

  const saveStreamPreferences = (next: StreamPreferences): void => {
    setStreamPreferences(next);
    persistStreamPreferences(next);
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

  const audioConnection = useWorkspaceAudioConnection({
    activeLobbyId,
    onProbeFailure: () => {
      scheduleActiveLobbyReconnect("lobby-state-probe");
    },
  });

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
        audioProcessingProps={{
          enhancedNoiseSuppressionEnabled:
            audioPreferences.enhancedNoiseSuppressionEnabled,
          onToggleEnhancedNoiseSuppression:
            handleToggleEnhancedNoiseSuppression,
        }}
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

      <ScreenShareModal
        isOpen={isScreenShareModalOpen}
        isLoadingSources={isLoadingScreenShareSources}
        isStarting={isStartingScreenShare}
        error={screenShareModalError}
        sourceKind={selectedScreenShareSourceKind}
        monitorSources={monitorScreenShareSources}
        windowSources={windowScreenShareSources}
        activeSources={activeScreenShareSources}
        selectedSourceId={selectedScreenShareSourceId}
        selectedQuality={selectedScreenShareQuality}
        qualityOptions={SCREEN_SHARE_QUALITY_OPTIONS}
        onClose={closeScreenShareModal}
        onRefreshSources={() => {
          void loadScreenShareSources();
        }}
        onStart={() => {
          void startScreenShareFromModal();
        }}
        onSelectSource={(sourceId) => {
          setSelectedScreenShareSourceId(sourceId);
        }}
        onChangeKind={handleScreenShareSourceKindChange}
        onChangeQuality={setSelectedScreenShareQuality}
      />

      <CameraShareModal
        isOpen={isCameraShareModalOpen}
        isPreparingPreview={isPreparingCameraPreview}
        isStarting={isStartingCameraShare}
        error={cameraShareModalError}
        previewStream={cameraPreviewStream}
        previewRef={cameraPreviewRef}
        onClose={closeCameraShareModal}
        onRefreshPreview={() => {
          void prepareCameraPreview();
        }}
        onStart={() => {
          void startCameraShareFromModal();
        }}
      />
    </section>
  );
}

export default WorkspaceShell;
