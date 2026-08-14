import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "antd";
import type { UserRole, UserDirectoryEntry } from "../../../shared/auth-contracts";
import type { DesktopAppPreferences } from "../../../shared/desktop-api-types";
import {
  CameraShareModal,
  WorkspaceMainPanel,
  WorkspaceRail,
  WorkspaceSidebar,
  CallDock,
} from "../features/workspace/components";
import AdminPanel from "../features/admin/components/admin-panel";
import { isAdminRole } from "../features/auth/permissions";
import { LobbyPasswordPromptModal } from "../features/workspace/components/lobby/lobby-password-prompt-modal";
import { ScreenShareModal, SCREEN_SHARE_QUALITY_OPTIONS } from "../features/screen-share";
import {
  useBlockedUsers,
  useDirectMessages,
  usePresenceStatus,
  useVoiceHotkeys,
  useWorkspaceAudioConnection,
  useWorkspaceLobbyActions,
  useLobbyRoom,
  useWorkspaceMediaControls,
  useScreenSubscriptions,
  useWorkspaceUsers,
  useMediaDevices,
  useWorkspacePreferences,
  useWorkspaceAudioCues,
  useWorkspaceLobbies,
  useNetworkReconnect,
  useCallSession,
  useRemoteParticipantAudio,
  useRoomTransitions,
} from "../features/workspace/hooks";
import { useLivekitSession } from "../features/livekit";
import { soundEffectManager } from "../features/sound-effects";
import workspaceService from "../features/workspace/services";
import { useUiStore } from "../store/ui-store";
import type { AudioPreferences } from "../features/workspace/components/settings/settings-main-panel-types";

interface WorkspaceShellProps {
  currentUserId: string;
  currentUsername: string;
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
  onLogout: () => void;
  isLoggingOut: boolean;
}

function WorkspaceShell({
  currentUserId,
  currentUsername,
  currentUserRole,
  currentUserCreatedAt,
  onLogout,
  isLoggingOut,
}: WorkspaceShellProps) {
  // ----- UI STORE -----
  const workspaceSection = useUiStore((state) => state.workspaceSection);
  const settingsSection = useUiStore((state) => state.settingsSection);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setStatus = useUiStore((state) => state.setStatus);

  useEffect(() => {
    if (isAdminRole(currentUserRole)) {
      setWorkspaceSection("admin");
    }
  }, [currentUserRole, setWorkspaceSection]);

  // ----- SHARED STATE / REFS -----
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const activeLobbyRef = useRef<string | null>(null);
  useEffect(() => {
    activeLobbyRef.current = activeLobbyId;
  }, [activeLobbyId]);

  // Marks a lobbyId the current user was just server-kicked from. While set,
  // the reconnect loop must not silently rejoin that lobby (it would undo the
  // kick), and disconnect handlers must not claim they're "reconnecting".
  // Cleared on any subsequent successful manual join.
  const kickedLobbyIdRef = useRef<string | null>(null);

  const { isOnline, shouldEmitReconnectStatus } = useNetworkReconnect();
  const { audioInputDevices, audioOutputDevices } = useMediaDevices();

  // ----- PREFERENCES -----
  const {
    cameraPreferences,
    audioPreferences,
    streamPreferences,
    hardwareAcceleration,
    saveCameraPreferences,
    saveAudioPreferences,
    saveStreamPreferences,
  } = useWorkspacePreferences();

  const videoPublishPreferences = useMemo(
    () => ({
      codec: streamPreferences.videoCodec,
      hardwareAcceleration,
    }),
    [streamPreferences.videoCodec, hardwareAcceleration],
  );

  useEffect(() => {
    soundEffectManager.configure({
      enabled: audioPreferences.notificationSoundsEnabled,
    });
  }, [audioPreferences.notificationSoundsEnabled]);

  // An unplugged device must not stay selected. The capture path already falls
  // back to the default microphone on its own, but the stored preference kept
  // pointing at the missing device — so the settings UI showed a device that
  // was not being used and the user had no idea why their headset went quiet.
  useEffect(() => {
    // Before permission is granted, enumerateDevices returns entries with blank
    // ids. Treating that as "device gone" would wipe the preference on startup.
    const hasResolvedIds = (devices: MediaDeviceInfo[]): boolean =>
      devices.some((device) => device.deviceId.length > 0);

    const patch: Partial<AudioPreferences> = {};

    const inputId = audioPreferences.selectedAudioInputDeviceId;
    if (
      inputId &&
      hasResolvedIds(audioInputDevices) &&
      !audioInputDevices.some((device) => device.deviceId === inputId)
    ) {
      patch.selectedAudioInputDeviceId = null;
    }

    const outputId = audioPreferences.selectedAudioOutputDeviceId;
    if (
      outputId &&
      hasResolvedIds(audioOutputDevices) &&
      !audioOutputDevices.some((device) => device.deviceId === outputId)
    ) {
      patch.selectedAudioOutputDeviceId = null;
    }

    if (Object.keys(patch).length === 0) {
      return;
    }

    saveAudioPreferences({ ...audioPreferences, ...patch });
    setStatus("Seçili ses cihazı çıkarıldı, varsayılan cihaza geçildi.", "warn");
  }, [
    audioInputDevices,
    audioOutputDevices,
    audioPreferences,
    saveAudioPreferences,
    setStatus,
  ]);

  // ----- LIVEKIT SESSION -----
  const scheduleActiveLobbyReconnectProxy = useCallback(
    (reason: any, immediate: boolean) => {
      if (activeLobbyReconnectProxyRef.current) {
        activeLobbyReconnectProxyRef.current(reason, immediate);
      }
    },
    [],
  );
  const activeLobbyReconnectProxyRef = useRef<any>(null);

  const {
    liveKitSessionRef,
    remoteParticipantStreams,
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
    activeNoiseSuppressionMode,
    remoteParticipantAudioPreferencesRef,
    activeSpeakerIds,
    liveKitConnectionState,
    mediaStats,
  } = useLivekitSession(
    currentUserId,
    audioPreferences,
    shouldEmitReconnectStatus,
    activeLobbyRef,
    scheduleActiveLobbyReconnectProxy,
    kickedLobbyIdRef,
    videoPublishPreferences,
  );

  const {
    setMuted: handleSetRemoteParticipantMuted,
    setVolume: handleSetRemoteParticipantVolume,
    setScreenAudioMuted: handleSetRemoteParticipantScreenAudioMuted,
    setScreenAudioVolume: handleSetRemoteParticipantScreenAudioVolume,
    setCameraHidden: handleSetRemoteParticipantCameraHidden,
  } = useRemoteParticipantAudio({
    liveKitSessionRef,
    preferencesRef: remoteParticipantAudioPreferencesRef,
    setPreferences: setRemoteParticipantAudioPreferences,
  });

  // ----- WORKSPACE USERS -----
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
    // No workspaceSection: the directory and its stream now run for the whole
    // session rather than only while a particular tab is open.
  } = useWorkspaceUsers({ currentUsername });

  // ----- 1-TO-1 CALL SESSION -----
  const {
    callState,
    ongoingCall,
    setOngoingCall,
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endActiveCall,
    rejoinCall,
  } = useCallSession({
    currentUserId,
    currentUsername,
    setActiveLobbyId,
    setStatus,
  });

  useEffect(() => {
    if (callState.status === "active" && callState.peerUser) {
      setWorkspaceSection("users");
      setSelectedUserId(callState.peerUser.userId);
    }
  }, [callState.status, callState.peerUser, setWorkspaceSection, setSelectedUserId]);

  // Peer ids only, so the unread seed does not re-run every time an avatar or
  // presence flag changes in the directory.
  const directoryPeerUserIds = useMemo(() => {
    if (!usersQuery.data?.ok || !usersQuery.data.data) return [];
    return usersQuery.data.data.users
      .map((user) => user.userId)
      .filter((userId) => userId !== currentUserId);
  }, [currentUserId, usersQuery.data]);

  const avatarByUserId = useMemo(() => {
    if (!usersQuery.data?.ok || !usersQuery.data.data) return {};
    return usersQuery.data.data.users.reduce<
      Record<string, string | null | undefined>
    >((accumulator: any, user: any) => {
      accumulator[user.userId] = user.avatarUrl;
      return accumulator;
    }, {});
  }, [usersQuery.data]);

  const currentUserAvatarUrl = avatarByUserId[currentUserId] ?? null;

  // ----- LOBBY ROOM / CHAT -----
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
    lobbyReplyTo,
    setLobbyReplyTo,
    lobbyPendingAttachment,
    setLobbyPendingAttachment,
    editLobbyMessage,
    toggleLobbyReaction,
    lobbySearchQuery,
    lobbySearchResults,
    isSearchingLobbyMessages,
    runLobbySearch,
    clearLobbySearch,
    patchLobbyMemberState,
  } = useLobbyRoom({
    activeLobbyId,
    workspaceSection: workspaceSection === "admin" ? "lobbies" : workspaceSection,
    setStatus,
  });

  // ----- MEDIA CONTROLS -----
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
    screenShareSources,
    selectedScreenShareSourceId,
    setSelectedScreenShareSourceId,
    selectedScreenShareSourceKind,
    selectedScreenShareQuality,
    setSelectedScreenShareQuality,
    selectedScreenShareContentMode,
    setSelectedScreenShareContentMode,
    captureSystemAudio,
    setCaptureSystemAudio,
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
    setMicState,
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
    reconcileDeclaredAudioState,
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

  // ----- SCREEN SHARE WATCHING (opt-in) -----
  const { isWatchingScreen, watchScreen, stopWatchingScreen } =
    useScreenSubscriptions({ liveKitSessionRef, activeLobbyId });

  // Mic/deafen drift watchdog. The local tile always renders local state, so a
  // disagreement with the server roster is invisible here and visible to
  // everyone else — this is what closes that gap.
  useEffect(() => {
    const self = lobbyMembers.find((member) => member.userId === currentUserId);
    if (!self) {
      return;
    }

    reconcileDeclaredAudioState(self.muted, self.deafened);
  }, [lobbyMembers, currentUserId, reconcileDeclaredAudioState]);

  // ----- 1-TO-1 CALL MEMBERS -----
  const callMembers = useMemo(() => {
    if (!activeLobbyId?.startsWith("call_") || !callState.peerUser) return [];

    const localMember = {
      userId: currentUserId,
      username: currentUsername,
      joinedAt: new Date().toISOString(),
      muted: !micEnabled,
      serverMuted: false,
      deafened: !headphoneEnabled,
      speaking: activeSpeakerIds.includes(currentUserId),
      cameraEnabled,
      screenSharing: screenEnabled,
    };

    // Only show peer tile if they are actually connected to LiveKit.
    // When peer does a soft-leave they disconnect from LiveKit, so their entry
    // disappears from remoteParticipantStreams — we must not render them as present.
    const peerActuallyInRoom = !!remoteParticipantStreams[callState.peerUser.userId];
    if (!peerActuallyInRoom) {
      return [localMember];
    }

    return [
      localMember,
      {
        userId: callState.peerUser.userId,
        username: callState.peerUser.username,
        joinedAt: new Date().toISOString(),
        muted: false,
        serverMuted: false,
        deafened: false,
        speaking: activeSpeakerIds.includes(callState.peerUser.userId),
        cameraEnabled: remoteParticipantStreams[callState.peerUser.userId]?.cameraEnabled ?? false,
        screenSharing: remoteParticipantStreams[callState.peerUser.userId]?.screenEnabled ?? false,
      }
    ];
  }, [
    activeLobbyId,
    callState.peerUser,
    currentUserId,
    currentUsername,
    micEnabled,
    headphoneEnabled,
    cameraEnabled,
    screenEnabled,
    remoteParticipantStreams,
    activeSpeakerIds,
  ]);


  // ----- PREFERENCE SYNC EFFECT -----
  const prevAudioPreferencesRef = useRef(audioPreferences);
  useEffect(() => {
    const previous = prevAudioPreferencesRef.current;
    const next = audioPreferences;

    if (next !== previous) {
      const shouldRefreshMicProcessing =
        Boolean(activeLobbyId) &&
        micEnabled &&
        (next.enhancedNoiseSuppressionEnabled !==
          previous.enhancedNoiseSuppressionEnabled ||
          next.noiseSuppressionPreset !== previous.noiseSuppressionPreset ||
          next.selectedAudioInputDeviceId !==
            previous.selectedAudioInputDeviceId);

      if (activeLobbyId && liveKitSessionRef.current) {
        liveKitSessionRef.current.setAudioProcessingPreferences({
          enhancedNoiseSuppressionEnabled: next.enhancedNoiseSuppressionEnabled,
          noiseSuppressionPreset: next.noiseSuppressionPreset,
          selectedAudioInputDeviceId: next.selectedAudioInputDeviceId,
          selectedAudioOutputDeviceId: next.selectedAudioOutputDeviceId,
          masterVolume: next.masterVolume,
          microphoneVolume: next.microphoneVolume,
        });

        if (shouldRefreshMicProcessing) {
          liveKitSessionRef.current
            .refreshMicrophoneProcessing()
            .catch((error: unknown) => {
              setStatus(
                `Mikrofon yenileme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
                "warn",
              );
            });
        }
      }
      prevAudioPreferencesRef.current = next;
    }
  }, [
    audioPreferences,
    activeLobbyId,
    micEnabled,
    liveKitSessionRef,
    setStatus,
  ]);

  // ----- HOTKEYS + PUSH-TO-TALK -----
  const [desktopPreferences, setDesktopPreferences] =
    useState<DesktopAppPreferences | null>(null);

  useEffect(() => {
    let active = true;

    const load = (): void => {
      void window.desktopApi.getAppPreferences().then((result) => {
        if (active && result.ok && result.data?.preferences) {
          setDesktopPreferences(result.data.preferences);
        }
      });
    };

    load();
    // The settings panel writes preferences through its own IPC call, and there
    // is no change event for them; refocusing the window is the cheapest point
    // to notice an edit made in another section.
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  const {
    isBlocked,
    blockUser,
    unblockUser,
    isUpdating: isBlockUpdating,
  } = useBlockedUsers(true);

  const handleToggleBlocked = useCallback(
    async (userId: string): Promise<void> => {
      const wasBlocked = isBlocked(userId);
      const ok = wasBlocked
        ? await unblockUser(userId)
        : await blockUser(userId);

      if (!ok) {
        setStatus(
          wasBlocked ? "Engel kaldırılamadı." : "Kullanıcı engellenemedi.",
          "error",
        );
        return;
      }

      setStatus(
        wasBlocked ? "Engel kaldırıldı." : "Kullanıcı engellendi.",
        "ok",
      );
    },
    [isBlocked, blockUser, unblockUser, setStatus],
  );

  // Presence is reported for as long as the workspace is mounted — that is
  // exactly the window in which the user has a live directory socket.
  const {
    selectedStatus: selectedPresenceStatus,
    effectiveStatus: effectivePresenceStatus,
    setSelectedStatus: setSelectedPresenceStatus,
  } = usePresenceStatus(true);

  useVoiceHotkeys({
    preferences: desktopPreferences,
    micEnabled,
    onToggleMic: handleMicToggle,
    onToggleDeafen: handleHeadphoneToggle,
    onSetMic: setMicState,
  });

  // Clicking an OS notification opens the conversation it came from.
  useEffect(() => {
    return window.desktopApi.onNotificationActivated((payload) => {
      if (!payload.peerUserId) {
        return;
      }
      setWorkspaceSection("users");
      setSelectedUserId(payload.peerUserId);
    });
  }, [setSelectedUserId, setWorkspaceSection]);

  // ----- ORCHESTRATION FUNCTIONS -----
  const performPostJoinSynchronization = useCallback(
    async (lobbyId: string): Promise<void> => {
      // The LiveKit failure used to be swallowed here. The reconnect chain then
      // saw a resolved promise, reset its backoff counter and told the user
      // "connection restored" while there was no audio room at all. Let it
      // throw so the caller can retry with backoff.
      const liveKitTask = (async () => {
        try {
          const result = await workspaceService.createLiveKitToken({ room: lobbyId });
          if (!result.ok || !result.data) {
            throw new Error(result.error?.message ?? "Token alinamadi");
          }

          const { token, serverUrl: url } = result.data;
          await liveKitSessionRef.current?.setMicrophoneEnabled(micEnabled);
          await liveKitSessionRef.current?.connect(url, token, lobbyId);
        } catch (error) {
          setStatus(
            `LiveKit bağlantısı kurulamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
            "warn",
          );
          throw error;
        }
      })();

      await Promise.all([
        liveKitTask,
        syncLobbyAudioState(lobbyId),
        syncLobbyMediaState(lobbyId),
      ]);
    },
    [
      micEnabled,
      syncLobbyAudioState,
      syncLobbyMediaState,
      setStatus,
      liveKitSessionRef,
    ],
  );

  // ----- WORKSPACE LOBBIES STATE -----
  const lobbiesQuery = useQuery({
    queryKey: ["workspace-lobbies"],
    queryFn: () => workspaceService.listLobbies(),
    enabled: workspaceSection === "lobbies",
    staleTime: 15_000,
  });

  const activeLobbyReconnectInFlightRef = useRef(false);
  const activeLobbyReconnectAttemptRef = useRef(0);
  const hasSeenActiveLobbyStateRef = useRef<Record<string, boolean>>({});
  const hasSeenCurrentUserInLobbyRef = useRef(false);

  // Reset hasSeenActiveLobbyStateRef and hasSeenCurrentUserInLobbyRef for non-active lobbies
  useEffect(() => {
    const activeId = activeLobbyId;
    hasSeenCurrentUserInLobbyRef.current = false;
    for (const key of Object.keys(hasSeenActiveLobbyStateRef.current)) {
      if (key !== activeId) {
        delete hasSeenActiveLobbyStateRef.current[key];
      }
    }
  }, [activeLobbyId]);

  const {
    knownLobbies: lobbies,
    setKnownLobbies,
    lobbyMembersById,
    clearActiveLobbyReconnectTimer,
    scheduleActiveLobbyReconnect,
  } = useWorkspaceLobbies({
    isOnline,
    shouldEmitReconnectStatus,
    setStatus,
    activeLobbyId,
    joiningLobbyId: null,
    isLeavingLobby: false,
    activeLobbyReconnectInFlightRef,
    activeLobbyReconnectAttemptRef,
    performPostJoinSynchronization,
    lobbiesQuery,
    kickedLobbyIdRef,
  });

  useEffect(() => {
    activeLobbyReconnectProxyRef.current = scheduleActiveLobbyReconnect;
  }, [scheduleActiveLobbyReconnect]);

  // Active-lobby roster prefers the WS snapshot (lobbyMembersById, ~1s push) and
  // falls back to the REST lobbyStateQuery only when the stream hasn't delivered
  // it yet. This is what lets the REST poll run slowly without a laggy roster.
  const activeLobbyRosterMembers = useMemo(() => {
    if (!activeLobbyId || activeLobbyId.startsWith("call_")) return lobbyMembers;
    return lobbyMembersById[activeLobbyId] ?? lobbyMembers;
  }, [activeLobbyId, lobbyMembersById, lobbyMembers]);

  const activeLobby = useMemo(() => {
    if (!activeLobbyId) return null;
    return lobbies.find((lobby) => lobby.id === activeLobbyId) ?? null;
  }, [activeLobbyId, lobbies]);

  const hasActiveLobby = activeLobbyId !== null;

  // ----- DIRECT MESSAGES -----
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
    typingPeerIds,
    notifyTyping,
    loadOlderMessages,
    isLoadingOlderMessages,
    hasMoreMessages,
    replyTo,
    setReplyTo,
    pendingAttachment,
    setPendingAttachment,
    handleEditMessage,
    handleToggleReaction,
    searchQuery: directSearchQuery,
    searchResults: directSearchResults,
    isSearching: isSearchingDirectMessages,
    runSearch: runDirectSearch,
    clearSearch: clearDirectSearch,
  } = useDirectMessages({
    currentUserId,
    peerUserIds: directoryPeerUserIds,
    selectedUserId,
    workspaceSection: workspaceSection === "admin" ? "users" : workspaceSection,
    setStatus,
    suppressNotifications: effectivePresenceStatus === "dnd",
  });

  const handleCopyUsername = useCallback(
    async (username: string): Promise<void> => {
      try {
        if (!navigator?.clipboard)
          throw new Error("Pano erişimi desteklenmiyor");
        await navigator.clipboard.writeText(username);
        setStatus(`@${username} kullanıcı adı kopyalandı`, "ok");
      } catch (error) {
        setStatus(
          `Kopyalama başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
          "warn",
        );
      }
    },
    [setStatus],
  );

  const sectionTitle = useMemo(() => {
    if (workspaceSection === "users") return "Arkadaşlar";
    if (workspaceSection === "settings") return "Ayarlar";
    return "Lobiler";
  }, [workspaceSection]);

  // ----- SOUND CUES -----
  useWorkspaceAudioCues({
    activeLobbyId,
    currentUserId,
    lobbyMembers: activeLobbyId?.startsWith("call_") ? callMembers : activeLobbyRosterMembers,
  });

  // ----- LOBBY ACTIONS -----
  const {
    isCreatingLobby,
    renamingLobbyId,
    deletingLobbyId,
    joiningLobbyId,
    isLeavingLobby,
    createLobby,
    updateLobby,
    deleteLobby,
    joinLobby,
    leaveActiveLobby,
    pendingPasswordLobby,
    cancelPasswordPrompt,
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
    kickedLobbyIdRef,
  });

  // ----- AUTOMATIC CALL ROOM LIVEKIT CONNECTION -----
  //
  // Fires once per call room. performPostJoinSynchronization is read through a
  // ref rather than listed as a dependency: it changes identity on every render
  // (see use-workspace-media-controls), so this effect used to re-run on every
  // render — at least 1 Hz from the media-stats tick and up to 10 Hz while
  // anyone was speaking — minting a fresh LiveKit token each time. While the
  // room was still `connecting` the idempotency check in connect() did not
  // short-circuit either, so the second call tore the half-built room down and
  // rebuilt it: a join loop that never settled on a slow network.
  const performPostJoinSyncRef = useRef(performPostJoinSynchronization);
  useEffect(() => {
    performPostJoinSyncRef.current = performPostJoinSynchronization;
  });

  const syncedCallLobbyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeLobbyId || !activeLobbyId.startsWith("call_")) {
      syncedCallLobbyRef.current = null;
      return;
    }

    if (syncedCallLobbyRef.current === activeLobbyId) {
      return;
    }
    syncedCallLobbyRef.current = activeLobbyId;

    performPostJoinSyncRef.current(activeLobbyId).catch((error) => {
      // Let a failed connect be retried on the next entry into this room.
      syncedCallLobbyRef.current = null;
      console.error("[WorkspaceShell] Automatic call LiveKit synchronization failed:", error);
    });
  }, [activeLobbyId]);

  // ----- CLIENT KICK DETECTION -----
  useEffect(() => {
    if (!activeLobbyId || activeLobbyId.startsWith("call_")) return;

    const members = lobbyMembersById[activeLobbyId];
    if (members) {
      hasSeenActiveLobbyStateRef.current[activeLobbyId] = true;
      const isStillInLobby = members.some((m) => m.userId === currentUserId);
      if (isStillInLobby) {
        hasSeenCurrentUserInLobbyRef.current = true;
      } else {
        // Only kick if we have previously been seen in this lobby since joining
        if (hasSeenCurrentUserInLobbyRef.current) {
          console.log(`[WorkspaceShell] Current user is not in active lobby ${activeLobbyId}. Kicked.`);
          message.warning("Odadan atıldınız veya oda kapatıldı.");
          // Reset synchronously (not just on the eventual activeLobbyId->null
          // transition) so a second SSE push landing before leaveActiveLobby's
          // async REST call resolves can't re-fire this branch.
          hasSeenCurrentUserInLobbyRef.current = false;
          delete hasSeenActiveLobbyStateRef.current[activeLobbyId];
          kickedLobbyIdRef.current = activeLobbyId;
          void leaveActiveLobby("kicked");
        }
      }
    } else {
      // Only treat as deleted if we have previously seen this lobby's state.
      // This prevents racing with the initial stream update right after joining.
      if (hasSeenActiveLobbyStateRef.current[activeLobbyId]) {
        console.log(`[WorkspaceShell] Active lobby ${activeLobbyId} was deleted.`);
        message.warning("Odadan atıldınız veya oda kapatıldı.");
        hasSeenCurrentUserInLobbyRef.current = false;
        delete hasSeenActiveLobbyStateRef.current[activeLobbyId];
        kickedLobbyIdRef.current = activeLobbyId;
        void leaveActiveLobby("kicked");
      }
    }
  }, [activeLobbyId, lobbyMembersById, currentUserId, leaveActiveLobby]);

  // ----- MUTUAL EXCLUSION & TRANSITIONS -----
  const {
    handleJoinLobby,
    handleInitiateCall,
    handleAcceptCall,
    handleRejoinCall,
    handleEndActiveCall,
    handleLeaveLobbyOrEndCall,
  } = useRoomTransitions({
    activeLobbyRef,
    liveKitSessionRef,
    activeLobbyId,
    callPeer: callState.peerUser,
    remoteParticipantStreams,
    endActiveCall,
    leaveActiveLobby,
    resetLocalMediaCapture,
    joinLobby,
    initiateCall,
    acceptCall,
    rejoinCall,
  });

  // ----- CALL PRESENCE -----
  //
  // A 1:1 call borrows the lobby machinery under the room id `call_<id>`, which
  // is right for media and wrong for the lobbies UI: that panel opened its
  // "connected room" layer for any non-null activeLobbyId, so being in a call
  // hid the lobby list behind an empty room with no roster. The lobbies half of
  // the tree gets the id only when it names a real lobby.
  const isInCallRoom = Boolean(activeLobbyId?.startsWith("call_"));
  const lobbyRoomId = isInCallRoom ? null : activeLobbyId;

  const callPeerUserId = callState.peerUser?.userId ?? null;

  // The stage lives in the peer's conversation, so that is the one place the
  // dock would be repeating itself.
  const isCallStageVisible =
    workspaceSection === "users" &&
    callPeerUserId !== null &&
    selectedUserId === callPeerUserId;

  const openCallConversation = useCallback((): void => {
    if (!callPeerUserId) {
      return;
    }
    setWorkspaceSection("users");
    setSelectedUserId(callPeerUserId);
  }, [callPeerUserId, setWorkspaceSection, setSelectedUserId]);

  // Answering from a lobby, from settings or from another conversation used to
  // leave the callee looking at whatever they were looking at, with the call
  // running and its stage rendered nowhere.
  const incomingCallerId = callState.callerId;
  const handleAcceptCallAndOpen = useCallback(async (): Promise<void> => {
    // Read before accepting: acceptCall moves the state to "active" and the
    // caller id would be gone from this closure's next read.
    const peerUserId = incomingCallerId;
    await handleAcceptCall();
    if (peerUserId) {
      setWorkspaceSection("users");
      setSelectedUserId(peerUserId);
    }
  }, [incomingCallerId, handleAcceptCall, setWorkspaceSection, setSelectedUserId]);

  const audioConnection = useWorkspaceAudioConnection({
    activeLobbyId,
    liveKitConnectionState,
    mediaStats,
  });

  const handleSelectAudioInputDevice = (deviceId: string | null): void => {
    console.log(`[WorkspaceShell] Mikrofon cihazı değiştiriliyor: ${deviceId ?? "Varsayılan"}`);
    saveAudioPreferences({
      ...audioPreferences,
      selectedAudioInputDeviceId: deviceId,
    });
  };

  const handleSelectAudioOutputDevice = (deviceId: string | null): void => {
    console.log(`[WorkspaceShell] Ses çıkış cihazı değiştiriliyor: ${deviceId ?? "Varsayılan"}`);
    saveAudioPreferences({
      ...audioPreferences,
      selectedAudioOutputDeviceId: deviceId,
    });
  };

  const handleToggleEnhancedNoiseSuppression = (): void => {
    saveAudioPreferences({
      ...audioPreferences,
      enhancedNoiseSuppressionEnabled:
        !audioPreferences.enhancedNoiseSuppressionEnabled,
    });
  };

  const unreadByPeerIdWithCalls = useMemo(() => {
    const counts = { ...unreadByPeerId };
    if (callState.status === "incoming" && callState.callerId) {
      counts[callState.callerId] = (counts[callState.callerId] ?? 0) + 1;
    }
    return counts;
  }, [unreadByPeerId, callState.status, callState.callerId]);

  const totalUnreadDirectMessages = useMemo(() => {
    return Object.values(unreadByPeerIdWithCalls).reduce((sum, count) => sum + count, 0);
  }, [unreadByPeerIdWithCalls]);

  return (
    <section className="ct-workspace-shell">
      <WorkspaceRail
        workspaceSection={workspaceSection}
        onSectionChange={setWorkspaceSection}
        totalUnreadDirectMessages={totalUnreadDirectMessages}
        currentUserRole={currentUserRole}
        currentUsername={currentUsername}
        currentUserId={currentUserId}
        onLogout={onLogout}
        isLoggingOut={isLoggingOut}
      />

      {workspaceSection === "admin" ? (
        <AdminPanel />
      ) : (
        <>
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
              unreadByUserId: unreadByPeerIdWithCalls,
              callState: callState,
              presenceStatus: selectedPresenceStatus,
              onPresenceStatusChange: setSelectedPresenceStatus,
            }}
            lobbiesProps={{
              lobbiesQuery,
              lobbies,
              lobbyMembersById,
              avatarByUserId,
              activeLobbyId: lobbyRoomId,
              joiningLobbyId,
              onJoinLobby: handleJoinLobby,
              onCreateLobby: createLobby,
              onUpdateLobby: updateLobby,
              onDeleteLobby: deleteLobby,
              isCreatingLobby,
              renamingLobbyId,
              deletingLobbyId,
              currentUserId,
              currentUserRole,
              allUsers: (usersQuery.data?.data?.users || []).map((u) => ({
                id: u.userId,
                username: u.username,
                displayName: u.displayName,
              })),
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
              audioInputDevices,
              audioOutputDevices,
              selectedAudioInputDeviceId:
                audioPreferences.selectedAudioInputDeviceId,
              selectedAudioOutputDeviceId:
                audioPreferences.selectedAudioOutputDeviceId,
              onSelectAudioInputDevice: handleSelectAudioInputDevice,
              onSelectAudioOutputDevice: handleSelectAudioOutputDevice,
              onToggleMic: handleMicToggle,
              onToggleHeadphone: handleHeadphoneToggle,
              onDisconnect: handleLeaveLobbyOrEndCall,
            }}
            audioConnectionProps={audioConnection}
            audioProcessingProps={{
              enhancedNoiseSuppressionEnabled:
                audioPreferences.enhancedNoiseSuppressionEnabled,
              micEnabled,
              activeNoiseMode:
                activeNoiseSuppressionMode === "processor"
                  ? "processor"
                  : activeNoiseSuppressionMode === "browser"
                    ? "browser"
                    : "none",
              onToggleEnhancedNoiseSuppression:
                handleToggleEnhancedNoiseSuppression,
            }}
          />

          <WorkspaceMainPanel
            currentUserId={currentUserId}
            workspaceSection={workspaceSection}
            currentUsername={currentUsername}
            sectionTitle={sectionTitle}
            micEnabled={micEnabled}
            headphoneEnabled={headphoneEnabled}
            cameraEnabled={cameraEnabled}
            screenEnabled={screenEnabled}
            localCameraStream={localCameraStream}
            localScreenStream={localScreenStream}
            remoteParticipantStreams={remoteParticipantStreams}
            remoteParticipantAudioPreferences={remoteParticipantAudioPreferences}
            activeSpeakerIds={activeSpeakerIds}
            avatarByUserId={avatarByUserId}
            settingsSection={settingsSection}
            currentUserRole={currentUserRole}
            currentUserCreatedAt={currentUserCreatedAt}
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
            cameraPreferences={cameraPreferences}
            audioPreferences={audioPreferences}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            streamPreferences={streamPreferences}
            onSaveCameraPreferences={saveCameraPreferences}
            onSaveAudioPreferences={saveAudioPreferences}
            onSaveStreamPreferences={saveStreamPreferences}
            lobbies={lobbies}
            activeLobbyId={activeLobbyId}
            lobbyRoomId={lobbyRoomId}
            activeLobbyName={
              isInCallRoom
                ? (callState.peerUser?.displayName || "Arama")
                : (activeLobby?.name ?? null)
            }
            joiningLobbyId={joiningLobbyId}
            onJoinLobby={handleJoinLobby}
            onSetRemoteParticipantMuted={handleSetRemoteParticipantMuted}
            onSetRemoteParticipantVolume={handleSetRemoteParticipantVolume}
            onSetRemoteParticipantCameraHidden={handleSetRemoteParticipantCameraHidden}
            onSetRemoteParticipantScreenAudioMuted={handleSetRemoteParticipantScreenAudioMuted}
            onSetRemoteParticipantScreenAudioVolume={handleSetRemoteParticipantScreenAudioVolume}
            lobbyStateQuery={lobbyStateQuery}
            lobbyMessagesQuery={lobbyMessagesQuery}
            lobbyMembers={activeLobbyId?.startsWith("call_") ? callMembers : activeLobbyRosterMembers}
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
            onLeaveLobby={handleLeaveLobbyOrEndCall}
            selectedUser={selectedUser}
            onCopyUsername={handleCopyUsername}
            isWatchingScreen={isWatchingScreen}
            onWatchScreen={watchScreen}
            onStopWatchingScreen={stopWatchingScreen}
            lobbyChatExtras={{
              replyTo: lobbyReplyTo,
              setReplyTo: setLobbyReplyTo,
              pendingAttachment: lobbyPendingAttachment,
              setPendingAttachment: setLobbyPendingAttachment,
              editMessage: editLobbyMessage,
              toggleReaction: toggleLobbyReaction,
              searchQuery: lobbySearchQuery,
              searchResults: lobbySearchResults,
              isSearching: isSearchingLobbyMessages,
              runSearch: runLobbySearch,
              clearSearch: clearLobbySearch,
            }}
            directMessagesProps={{
              directMessagesQuery,
              directMessages,
              messageDraft,
              setMessageDraft,
              isSendingMessage,
              sendDirectMessage: handleSendMessage,
              deleteDirectMessage: handleDeleteMessage,
              deletingDirectMessageId: deletingMessageId,
              onTyping: notifyTyping,
              isPeerTyping: Boolean(
                selectedUserId && typingPeerIds.includes(selectedUserId),
              ),
              currentUsername,
              isSelectedUserBlocked: Boolean(
                selectedUserId && isBlocked(selectedUserId),
              ),
              isBlockUpdating,
              onToggleBlocked: handleToggleBlocked,
              onLoadOlderMessages: loadOlderMessages,
              isLoadingOlderMessages,
              hasMoreMessages,
              replyTo,
              setReplyTo,
              pendingAttachment,
              setPendingAttachment,
              editMessage: handleEditMessage,
              toggleReaction: handleToggleReaction,
              searchQuery: directSearchQuery,
              searchResults: directSearchResults,
              isSearching: isSearchingDirectMessages,
              runSearch: runDirectSearch,
              clearSearch: clearDirectSearch,
            }}
            onSelectAudioInputDevice={handleSelectAudioInputDevice}
            onSelectAudioOutputDevice={handleSelectAudioOutputDevice}
            onInitiateCall={handleInitiateCall}
            callState={callState}
            ongoingCall={ongoingCall}
            onAcceptCall={handleAcceptCallAndOpen}
            onRejectCall={rejectCall}
            onCancelCall={cancelCall}
            onEndActiveCall={handleEndActiveCall}
            onRejoinCall={handleRejoinCall}
          />
        </>
      )}

      <CallDock
        callState={callState}
        isStageVisible={isCallStageVisible}
        onAccept={handleAcceptCallAndOpen}
        onReject={rejectCall}
        onCancel={cancelCall}
        onEnd={handleEndActiveCall}
        onOpenConversation={openCallConversation}
      />

      <ScreenShareModal
        isOpen={isScreenShareModalOpen}
        onClose={closeScreenShareModal}
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
        contentMode={selectedScreenShareContentMode}
        onChangeContentMode={setSelectedScreenShareContentMode}
        captureSystemAudio={captureSystemAudio}
        onRefreshSources={loadScreenShareSources}
        onStart={startScreenShareFromModal}
        onSelectSource={setSelectedScreenShareSourceId}
        onChangeKind={handleScreenShareSourceKindChange}
        onChangeQuality={setSelectedScreenShareQuality}
        onToggleCaptureSystemAudio={setCaptureSystemAudio}
      />

      <CameraShareModal
        isOpen={isCameraShareModalOpen}
        onClose={closeCameraShareModal}
        isPreparingPreview={isPreparingCameraPreview}
        isStarting={isStartingCameraShare}
        error={cameraShareModalError}
        previewStream={cameraPreviewStream}
        previewRef={cameraPreviewRef}
        onStart={startCameraShareFromModal}
        onRefreshPreview={prepareCameraPreview}
      />

      <LobbyPasswordPromptModal
        pending={pendingPasswordLobby}
        isJoining={joiningLobbyId !== null}
        onSubmit={(lobbyId, password) => void joinLobby(lobbyId, password)}
        onCancel={cancelPasswordPrompt}
      />
    </section>
  );
}

export default WorkspaceShell;
