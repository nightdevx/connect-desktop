import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserRole, UserDirectoryEntry } from "../../../shared/auth-contracts";
import {
  CameraShareModal,
  WorkspaceMainPanel,
  WorkspaceRail,
  WorkspaceSidebar,
  CallOverlay,
} from "../features/workspace/components";
import { ScreenShareModal, SCREEN_SHARE_QUALITY_OPTIONS } from "../features/screen-share";
import {
  useDirectMessages,
  useWorkspaceAudioConnection,
  useWorkspaceLobbyActions,
  useLobbyRoom,
  useWorkspaceMediaControls,
  useWorkspaceUsers,
  useMediaDevices,
  useWorkspacePreferences,
  useWorkspaceAudioCues,
  useWorkspaceLobbies,
  useNetworkReconnect,
  useCallSession,
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

const DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE = {
  muted: false,
  volumePercent: 100,
  cameraHidden: false,
};

const clampRemoteParticipantVolumePercent = (volumePercent: number): number => {
  if (!Number.isFinite(volumePercent)) {
    return DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE.volumePercent;
  }
  return Math.min(200, Math.max(0, Math.round(volumePercent)));
};

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

  // ----- SHARED STATE / REFS -----
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const activeLobbyRef = useRef<string | null>(null);
  useEffect(() => {
    activeLobbyRef.current = activeLobbyId;
  }, [activeLobbyId]);

  const { isOnline, shouldEmitReconnectStatus } = useNetworkReconnect();
  const { audioInputDevices, audioOutputDevices } = useMediaDevices();

  // ----- PREFERENCES -----
  const {
    cameraPreferences,
    audioPreferences,
    streamPreferences,
    saveCameraPreferences,
    saveAudioPreferences,
    saveStreamPreferences,
  } = useWorkspacePreferences();

  useEffect(() => {
    soundEffectManager.configure({
      enabled: audioPreferences.notificationSoundsEnabled,
    });
  }, [audioPreferences.notificationSoundsEnabled]);

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
  } = useLivekitSession(
    currentUserId,
    audioPreferences,
    shouldEmitReconnectStatus,
    activeLobbyRef,
    scheduleActiveLobbyReconnectProxy,
  );

  const handleSetRemoteParticipantMuted = useCallback(
    (participantUserId: string, muted: boolean): void => {
      const currentPreference =
        remoteParticipantAudioPreferencesRef.current[participantUserId] ??
        DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
      const nextPreference = {
        ...currentPreference,
        muted,
      };
      setRemoteParticipantAudioPreferences((previous) => ({
        ...previous,
        [participantUserId]: nextPreference,
      }));
      liveKitSessionRef.current?.setRemoteParticipantAudioPreference(
        participantUserId,
        nextPreference,
      );
    },
    [
      liveKitSessionRef,
      remoteParticipantAudioPreferencesRef,
      setRemoteParticipantAudioPreferences,
    ],
  );

  const handleSetRemoteParticipantVolume = useCallback(
    (participantUserId: string, volumePercent: number): void => {
      const currentPreference =
        remoteParticipantAudioPreferencesRef.current[participantUserId] ??
        DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
      const nextPreference = {
        ...currentPreference,
        volumePercent: clampRemoteParticipantVolumePercent(volumePercent),
      };
      setRemoteParticipantAudioPreferences((previous) => ({
        ...previous,
        [participantUserId]: nextPreference,
      }));
      liveKitSessionRef.current?.setRemoteParticipantAudioPreference(
        participantUserId,
        nextPreference,
      );
    },
    [
      liveKitSessionRef,
      remoteParticipantAudioPreferencesRef,
      setRemoteParticipantAudioPreferences,
    ],
  );

  const handleSetRemoteParticipantScreenAudioMuted = useCallback(
    (participantUserId: string, muted: boolean): void => {
      const currentPreference =
        remoteParticipantAudioPreferencesRef.current[participantUserId] ??
        DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
      const nextPreference = {
        ...currentPreference,
        screenAudioMuted: muted,
      };
      setRemoteParticipantAudioPreferences((previous) => ({
        ...previous,
        [participantUserId]: nextPreference,
      }));
      liveKitSessionRef.current?.setRemoteParticipantAudioPreference(
        participantUserId,
        nextPreference,
      );
    },
    [
      liveKitSessionRef,
      remoteParticipantAudioPreferencesRef,
      setRemoteParticipantAudioPreferences,
    ],
  );

  const handleSetRemoteParticipantScreenAudioVolume = useCallback(
    (participantUserId: string, volumePercent: number): void => {
      const currentPreference =
        remoteParticipantAudioPreferencesRef.current[participantUserId] ??
        DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
      const nextPreference = {
        ...currentPreference,
        screenAudioVolumePercent: clampRemoteParticipantVolumePercent(volumePercent),
      };
      setRemoteParticipantAudioPreferences((previous) => ({
        ...previous,
        [participantUserId]: nextPreference,
      }));
      liveKitSessionRef.current?.setRemoteParticipantAudioPreference(
        participantUserId,
        nextPreference,
      );
    },
    [
      liveKitSessionRef,
      remoteParticipantAudioPreferencesRef,
      setRemoteParticipantAudioPreferences,
    ],
  );



  const handleSetRemoteParticipantCameraHidden = useCallback(
    (participantUserId: string, cameraHidden: boolean): void => {
      const currentPreference =
        remoteParticipantAudioPreferencesRef.current[participantUserId] ??
        DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
      const nextPreference = {
        ...currentPreference,
        cameraHidden,
      };
      setRemoteParticipantAudioPreferences((previous) => ({
        ...previous,
        [participantUserId]: nextPreference,
      }));
      // Camera hiding is handled at the UI level in the participant tile
    },
    [remoteParticipantAudioPreferencesRef, setRemoteParticipantAudioPreferences],
  );

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
  } = useWorkspaceUsers({ currentUsername, workspaceSection });

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

  const directMessagePeerUserIds = useMemo(() => {
    if (!usersQuery.data?.ok || !usersQuery.data.data) return [];
    return usersQuery.data.data.users
      .map((user: any) => user.userId)
      .filter((userId: string) => userId !== currentUserId);
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
    patchLobbyMemberState,
  } = useLobbyRoom({
    activeLobbyId,
    workspaceSection,
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

  // ----- 1-TO-1 CALL MEMBERS -----
  const callMembers = useMemo(() => {
    if (!activeLobbyId?.startsWith("call_") || !callState.peerUser) return [];

    const localMember = {
      userId: currentUserId,
      username: currentUsername,
      joinedAt: new Date().toISOString(),
      muted: !micEnabled,
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

  // ----- ORCHESTRATION FUNCTIONS -----
  const performPostJoinSynchronization = useCallback(
    async (lobbyId: string): Promise<void> => {
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

  const {
    knownLobbies: lobbies,
    setKnownLobbies,
    lobbyMembersById,
    clearActiveLobbyReconnectTimer,
    scheduleActiveLobbyReconnect,
  } = useWorkspaceLobbies({
    workspaceSection,
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
  });

  useEffect(() => {
    activeLobbyReconnectProxyRef.current = scheduleActiveLobbyReconnect;
  }, [scheduleActiveLobbyReconnect]);

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
  } = useDirectMessages({
    currentUserId,
    peerUserIds: directMessagePeerUserIds,
    selectedUserId,
    workspaceSection,
    setStatus,
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
    lobbyMembers: activeLobbyId?.startsWith("call_") ? callMembers : lobbyMembers,
  });

  // ----- LOBBY ACTIONS -----
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

  // ----- AUTOMATIC CALL ROOM LIVEKIT CONNECTION -----
  useEffect(() => {
    if (activeLobbyId && activeLobbyId.startsWith("call_")) {
      console.log(`[WorkspaceShell] Active call lobby detected: ${activeLobbyId}. Auto-connecting to LiveKit.`);
      performPostJoinSynchronization(activeLobbyId).catch((error) => {
        console.error("[WorkspaceShell] Automatic call LiveKit synchronization failed:", error);
      });
    }
  }, [activeLobbyId, performPostJoinSynchronization]);

  // ----- MUTUAL EXCLUSION & TRANSITIONS -----
  const ensureCleanRoomTransition = useCallback(async (nextRoomId: string | null) => {
    const currentRoomId = activeLobbyRef.current;
    if (!currentRoomId) return;
    if (currentRoomId === nextRoomId) return;

    console.log(`[WorkspaceShell] Mutual exclusion: Transitioning from ${currentRoomId} to ${nextRoomId}. Cleaning up previous room.`);
    
    if (currentRoomId.startsWith("call_")) {
      // When transitioning away from a call room, treat as hard end
      // (the user is actively switching context, so we should notify the peer)
      const peerUserId = callState.peerUser?.userId;
      const peerInRoom = !!(peerUserId && remoteParticipantStreams[peerUserId]);
      await endActiveCall(peerInRoom);
      resetLocalMediaCapture();
      try {
        await liveKitSessionRef.current?.disconnect();
      } catch (e) {}
    } else {
      await leaveActiveLobby();
    }
  }, [callState.peerUser, remoteParticipantStreams, endActiveCall, leaveActiveLobby, resetLocalMediaCapture, liveKitSessionRef]);


  const handleJoinLobby = useCallback(async (lobbyId: string) => {
    await ensureCleanRoomTransition(lobbyId);
    await joinLobby(lobbyId);
  }, [ensureCleanRoomTransition, joinLobby]);

  const handleInitiateCall = useCallback(async (targetUser: UserDirectoryEntry) => {
    await ensureCleanRoomTransition(null);
    await initiateCall(targetUser);
  }, [ensureCleanRoomTransition, initiateCall]);

  const handleAcceptCall = useCallback(async () => {
    await ensureCleanRoomTransition(null);
    await acceptCall();
  }, [ensureCleanRoomTransition, acceptCall]);

  const handleRejoinCall = useCallback(async () => {
    await ensureCleanRoomTransition(null);
    await rejoinCall();
  }, [ensureCleanRoomTransition, rejoinCall]);

  const handleEndActiveCall = useCallback(async () => {
    // Compute peerInRoom: if peer is in LiveKit room → soft leave (they can continue)
    // If peer is NOT in the room → hard end (we're last, notify peer, write DM)
    const peerUserId = callState.peerUser?.userId;
    const peerInRoom = !!(peerUserId && remoteParticipantStreams[peerUserId]);
    await endActiveCall(peerInRoom);
    resetLocalMediaCapture();
    try {
      await liveKitSessionRef.current?.disconnect();
    } catch (e) {}
  }, [callState.peerUser, remoteParticipantStreams, endActiveCall, resetLocalMediaCapture, liveKitSessionRef]);

  const handleLeaveLobbyOrEndCall = useCallback(async () => {
    if (activeLobbyId?.startsWith("call_")) {
      const peerUserId = callState.peerUser?.userId;
      const peerInRoom = !!(peerUserId && remoteParticipantStreams[peerUserId]);
      await endActiveCall(peerInRoom);
      resetLocalMediaCapture();
      try {
        await liveKitSessionRef.current?.disconnect();
      } catch (e) {}
    } else {
      await leaveActiveLobby();
    }
  }, [activeLobbyId, callState.peerUser, remoteParticipantStreams, endActiveCall, leaveActiveLobby, resetLocalMediaCapture, liveKitSessionRef]);

  const audioConnection = useWorkspaceAudioConnection({
    activeLobbyId,
    onProbeFailure: () => {
      scheduleActiveLobbyReconnectProxy("lobby-state-probe", false);
    },
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
          unreadByUserId: unreadByPeerIdWithCalls,
          callState: callState,
        }}
        lobbiesProps={{
          lobbiesQuery,
          lobbies,
          lobbyMembersById,
          avatarByUserId,
          activeLobbyId,
          joiningLobbyId,
          onJoinLobby: handleJoinLobby,
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
        activeLobbyName={
          activeLobbyId?.startsWith("call_")
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
        lobbyMembers={activeLobbyId?.startsWith("call_") ? callMembers : lobbyMembers}
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
        onSelectAudioInputDevice={handleSelectAudioInputDevice}
        onSelectAudioOutputDevice={handleSelectAudioOutputDevice}
        onInitiateCall={handleInitiateCall}
        callState={callState}
        ongoingCall={ongoingCall}
        onAcceptCall={handleAcceptCall}
        onRejectCall={rejectCall}
        onCancelCall={cancelCall}
        onEndActiveCall={handleEndActiveCall}
        onRejoinCall={handleRejoinCall}
      />

      <CallOverlay
        callState={callState}
        onAccept={handleAcceptCall}
        onReject={rejectCall}
        onCancel={cancelCall}
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
    </section>
  );
}

export default WorkspaceShell;
