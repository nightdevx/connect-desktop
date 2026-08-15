import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "antd";
import type {
  UserRole,
  UserDirectoryEntry,
} from "../../../shared/auth-contracts";
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
  useFriends,
  usePresenceStatus,
  useVoiceHotkeys,
  useWorkspaceAudioConnection,
  useVideoQuality,
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
  useOpenConversations,
} from "../features/workspace/hooks";
import type { OpenConversation } from "../features/workspace/hooks";
import { useLivekitSession } from "../features/livekit";
import { soundEffectManager } from "../features/sound-effects";
import workspaceService from "../features/workspace/services";
import { useUiStore } from "../store/ui-store";
import type { WorkspaceSection } from "../store/ui-store";
import type { AudioPreferences } from "../features/workspace/components/settings/settings-main-panel-types";

const toConversationPeer = (user: UserDirectoryEntry): OpenConversation => ({
  userId: user.userId,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl ?? null,
});

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

  // Which text room is on screen. Kept apart from activeLobbyId on purpose:
  // that one means "the voice room I am connected to" and nothing else. A text
  // room is opened, never joined, so putting one on screen must leave the
  // LiveKit session — and everything else keyed off activeLobbyId — alone.
  const [openTextRoomId, setOpenTextRoomId] = useState<string | null>(null);

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
    selectedUserId,
    setSelectedUserId,
    directoryUsers,
    selectedUser,
    // No workspaceSection: the directory and its stream now run for the whole
    // session rather than only while a particular tab is open.
  } = useWorkspaceUsers({ currentUsername });

  // The sidebar lists conversations, not the directory: it is client-owned, so
  // opening one is this shell's job and every route into a conversation below
  // goes through openConversation.
  const {
    conversations,
    open: openConversation,
    close: closeConversation,
    isOpen: isConversationOpen,
  } = useOpenConversations(currentUserId);

  // The Arkadaş Ekle modal lives in the sidebar header, but the friends home
  // needs the same button, so the flag is up here and the modal stays there.
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);

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

  // Filled from useDirectMessages further down: names learned from the messages
  // strangers send. A ref because conversationPeer is defined above that call.
  const peerNamesRef = useRef<Record<string, string>>({});

  // Names a peer from whatever knows them, best source first: the directory has
  // the freshest profile but only for friends, the call signal names a stranger
  // who is ringing, the stored conversation is the snapshot taken the last time
  // either of those did, and a live message names whoever just wrote. A row that
  // is all four empty renders as "Bilinmeyen kullanıcı" rather than blocking the
  // selection.
  const conversationPeer = useCallback(
    (userId: string): OpenConversation => {
      const directoryUser = directoryUsers.find(
        (user) => user.userId === userId,
      );
      if (directoryUser) {
        return toConversationPeer(directoryUser);
      }

      if (callState.peerUser?.userId === userId) {
        return toConversationPeer(callState.peerUser);
      }

      const stored = conversations.find((entry) => entry.userId === userId);
      if (stored) {
        return stored;
      }

      // Last resort before the row reads "Bilinmeyen kullanıcı": a stranger who
      // messages while the app is open is in none of the sources above — the
      // directory holds friends only and the conversation seed was fetched at
      // launch — but their own message named them. Read through a ref because
      // useDirectMessages is called further down this component.
      const learned = peerNamesRef.current[userId];
      return {
        userId,
        username: learned ?? "",
        displayName: learned ?? "",
      };
    },
    [callState.peerUser, conversations, directoryUsers],
  );

  // The single door into a conversation. Selecting a peer with no row would
  // leave the sidebar with nothing highlighted and no way back to the thread,
  // so the row is created here rather than at each of the call, notification
  // and click sites. Already-open rows are left alone: open() moves a peer to
  // the front, and a plain click must not reshuffle the list under the cursor.
  const selectConversation = useCallback(
    (peer: OpenConversation): void => {
      if (!isConversationOpen(peer.userId)) {
        openConversation(peer);
      }
      setWorkspaceSection("users");
      setSelectedUserId(peer.userId);
    },
    [isConversationOpen, openConversation, setSelectedUserId, setWorkspaceSection],
  );

  const selectConversationById = useCallback(
    (userId: string): void => {
      selectConversation(conversationPeer(userId));
    },
    [conversationPeer, selectConversation],
  );

  // Closing the row you are reading drops you back to the friends home. Leaving
  // the selection alone would keep the thread on screen with nothing in the
  // sidebar pointing at it, and no unread to bring the row back.
  const closeSelectedConversation = useCallback(
    (userId: string): void => {
      closeConversation(userId);
      if (selectedUserId === userId) {
        setSelectedUserId(null);
      }
    },
    [closeConversation, selectedUserId, setSelectedUserId],
  );

  // The sidebar's "Ana Sayfa" button. Deliberately NOT closeSelectedConversation:
  // going home must leave every open conversation exactly where it was.
  const openFriendsHome = useCallback((): void => {
    setSelectedUserId(null);
  }, [setSelectedUserId]);

  // Arkadaşlar always lands on the friends home. The selection lives in
  // component state that nothing else clears, so coming back to the section
  // used to resurrect whatever thread was open last time. Clicking a row still
  // selects it: those routes go through selectConversation, not through the
  // rail.
  const handleSectionChange = useCallback(
    (section: WorkspaceSection): void => {
      if (section === "users") {
        setSelectedUserId(null);
      }
      setWorkspaceSection(section);
    },
    [setSelectedUserId, setWorkspaceSection],
  );

  // selectedUser resolves through the friends-only directory, so it is null for
  // every conversation with a non-friend — and a null one would put the friends
  // home on screen instead of the thread, mid-call included. The row's own
  // snapshot names them; role and join date exist only in the directory, so the
  // profile drawer degrades to "Üye" and "Bilinmiyor".
  const resolvedSelectedUser = useMemo<UserDirectoryEntry | null>(() => {
    if (selectedUser || !selectedUserId) {
      return selectedUser;
    }

    const peer = conversationPeer(selectedUserId);
    return {
      userId: peer.userId,
      username: peer.username,
      displayName: peer.displayName || peer.username || "Bilinmeyen kullanıcı",
      avatarUrl: peer.avatarUrl ?? null,
      role: "member",
      createdAt: "",
    };
  }, [conversationPeer, selectedUser, selectedUserId]);

  // Both selectors change identity whenever the conversation list does, and the
  // effects below must not re-run for that: one would drag the user back to the
  // call peer every time an unrelated message arrived, the other would tear
  // down and re-register the notification listener.
  const selectConversationRef = useRef(selectConversation);
  const selectConversationByIdRef = useRef(selectConversationById);
  useEffect(() => {
    selectConversationRef.current = selectConversation;
    selectConversationByIdRef.current = selectConversationById;
  });

  useEffect(() => {
    if (callState.status === "active" && callState.peerUser) {
      selectConversationRef.current(toConversationPeer(callState.peerUser));
    }
  }, [callState.status, callState.peerUser]);

  // Peer ids only, so the unread seed does not re-run every time an avatar or
  // presence flag changes in the directory. The open conversations are unioned
  // in because the directory is friends-only now: seeding from it alone lost
  // the badge for every non-friend you have history with.
  const directoryPeerUserIds = useMemo(() => {
    const users =
      usersQuery.data?.ok && usersQuery.data.data ? usersQuery.data.data.users : [];
    const peerIds = new Set([
      ...users.map((user) => user.userId),
      ...conversations.map((entry) => entry.userId),
    ]);
    peerIds.delete(currentUserId);
    return [...peerIds];
  }, [conversations, currentUserId, usersQuery.data]);

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
    // The chat follows whatever room is on screen. A text room never becomes
    // activeLobbyId, so it has to be named here or its messages would never
    // load — and while one is open the voice lobby's chat is not what is shown.
    activeLobbyId: openTextRoomId ?? activeLobbyId,
    workspaceSection: workspaceSection === "admin" ? "lobbies" : workspaceSection,
    setStatus,
    currentUserId,
    currentUsername,
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
    // One source of truth for the framerate: the toolbar's stream menu and
    // Ayarlar → Yayın now write through the same setter, so neither can show or
    // re-save a value the other has already replaced.
    onSaveStreamPreferences: saveStreamPreferences,
    setStatus,
    patchLobbyMemberState,
  });

  // ----- SCREEN SHARE WATCHING (opt-in) -----
  const { isWatchingScreen, watchScreen, stopWatchingScreen } =
    useScreenSubscriptions({ liveKitSessionRef, activeLobbyId });

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
        // screenAvailable (published), not screenEnabled (subscribed).
        //
        // Screen shares are opt-in, so screenEnabled only turns true once this
        // viewer has already asked to watch. Using it here meant a 1:1 call
        // never grew a screen slot for the peer, so the "Yayını izle" prompt
        // was never rendered and there was no way to start watching: you could
        // not watch because you were not watching. In a lobby the roster comes
        // from the server so this never showed up; a call has no roster and
        // synthesises its members right here.
        screenSharing:
          remoteParticipantStreams[callState.peerUser.userId]?.screenAvailable ?? false,
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

  // Enabled for the whole session, not while the users tab is open: `false`
  // unsubscribes from the users-WS, so a request arriving while the user sits
  // on Lobiler would be lost until the next reconnect. Admins never leave the
  // "admin" section on their own, which would make it never true at all.
  const friends = useFriends(true);

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
      selectConversationByIdRef.current(payload.peerUserId);
    });
  }, []);

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
    // lobbyMembers is the REST roster of whichever room the chat is showing, so
    // while a text room is open it describes that room and not this lobby. The
    // WS snapshot is the only trustworthy source then.
    const restFallback = openTextRoomId ? [] : lobbyMembers;
    return lobbyMembersById[activeLobbyId] ?? restFallback;
  }, [activeLobbyId, openTextRoomId, lobbyMembersById, lobbyMembers]);

  // Mic/deafen drift watchdog. The local tile always renders local state, so a
  // disagreement with the server roster is invisible here and visible to
  // everyone else — this is what closes that gap. It reads the active lobby's
  // roster rather than the chat's, which is a different room whenever a text
  // room is open.
  useEffect(() => {
    const self = activeLobbyRosterMembers.find(
      (member) => member.userId === currentUserId,
    );
    if (!self) {
      return;
    }

    reconcileDeclaredAudioState(self.muted, self.deafened);
  }, [activeLobbyRosterMembers, currentUserId, reconcileDeclaredAudioState]);

  const activeLobby = useMemo(() => {
    if (!activeLobbyId) return null;
    return lobbies.find((lobby) => lobby.id === activeLobbyId) ?? null;
  }, [activeLobbyId, lobbies]);

  // Resolved against the live list rather than trusted as stored: a text room
  // deleted while it was open would otherwise stay on screen as a room that no
  // longer exists — and, with no descriptor to read isTextOnly from, would come
  // back as a full voice stage complete with mic and camera controls.
  const openTextRoom = useMemo(() => {
    if (!openTextRoomId) return null;
    return (
      lobbies.find(
        (lobby) => lobby.id === openTextRoomId && lobby.isTextOnly,
      ) ?? null
    );
  }, [openTextRoomId, lobbies]);

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
    peerNamesById,
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
    currentUsername,
    peerUserIds: directoryPeerUserIds,
    selectedUserId,
    workspaceSection: workspaceSection === "admin" ? "users" : workspaceSection,
    setStatus,
    suppressNotifications: effectivePresenceStatus === "dnd",
  });

  peerNamesRef.current = peerNamesById;

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

  // Every way into a room funnels through here — the sidebar rows and the
  // selection screen's buttons — so the "is this a channel or a connection"
  // decision lives in one place. A text room only changes what is on screen;
  // the voice lobby underneath keeps running and stays audible.
  const handleSelectLobby = useCallback(
    (lobbyId: string): void => {
      if (lobbies.find((lobby) => lobby.id === lobbyId)?.isTextOnly) {
        setOpenTextRoomId(lobbyId);
        return;
      }

      // Closing the text room is also how the user gets back to a voice lobby
      // they are already connected to: joinLobby short-circuits on that click.
      setOpenTextRoomId(null);
      void handleJoinLobby(lobbyId);
    },
    [lobbies, handleJoinLobby],
  );

  // ----- CALL PRESENCE -----
  //
  // A 1:1 call borrows the lobby machinery under the room id `call_<id>`, which
  // is right for media and wrong for the lobbies UI: that panel opened its
  // "connected room" layer for any non-null activeLobbyId, so being in a call
  // hid the lobby list behind an empty room with no roster. The lobbies half of
  // the tree gets the id only when it names a real lobby.
  const isInCallRoom = Boolean(activeLobbyId?.startsWith("call_"));

  // What the lobbies panel puts on screen. An open text room wins: that is what
  // the user just clicked, and the voice lobby carries on underneath it.
  const lobbyRoomId = openTextRoom?.id ?? (isInCallRoom ? null : activeLobbyId);

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
    selectConversationById(callPeerUserId);
  }, [callPeerUserId, selectConversationById]);

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
      // Through the selector, not setSelectedUserId: a caller you are not
      // friends with has no directory entry and no row yet, and the stage only
      // renders inside their conversation.
      selectConversationById(peerUserId);
    }
  }, [incomingCallerId, handleAcceptCall, selectConversationById]);

  const audioConnection = useWorkspaceAudioConnection({
    activeLobbyId,
    liveKitConnectionState,
    mediaStats,
  });

  const videoQuality = useVideoQuality(mediaStats);

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

  // Anything NEW waiting for you gets a row, so a peer whose conversation was
  // closed comes back the moment they write or ring — the same rule Discord
  // uses. It reads the unread map rather than the socket so it also covers a
  // peer the friends-only directory has never heard of.
  //
  // A rising count, not a standing one: acting on "has unread" made closing an
  // unread row impossible, because dropping the row changed the conversation
  // list, which re-ran this effect, which found the same unread and put the row
  // straight back. Reading the conversation clears the count, so the seen map
  // resets with it and the next message opens the row again.
  const seenUnreadRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const seen = seenUnreadRef.current;
    const next: Record<string, number> = {};

    for (const [userId, count] of Object.entries(unreadByPeerIdWithCalls)) {
      next[userId] = count;
      if (count > (seen[userId] ?? 0) && !isConversationOpen(userId)) {
        openConversation(conversationPeer(userId));
      }
    }

    seenUnreadRef.current = next;
  }, [
    conversationPeer,
    isConversationOpen,
    openConversation,
    unreadByPeerIdWithCalls,
  ]);

  const totalUnreadDirectMessages = useMemo(() => {
    // Incoming friend requests ride this badge because the users sidebar — their
    // only renderer — is unmounted whenever the section is not "users", so a
    // request arriving while the user sits in Lobiler changed nothing on screen.
    // Deliberately no workspaceService.notify here, unlike DMs and calls: its zod
    // schema only accepts those two kinds, and the badge is the whole fix.
    return (
      Object.values(unreadByPeerIdWithCalls).reduce((sum, count) => sum + count, 0) +
      friends.incomingRequests.length
    );
  }, [unreadByPeerIdWithCalls, friends.incomingRequests]);

  return (
    <section className="ct-workspace-shell">
      <WorkspaceRail
        workspaceSection={workspaceSection}
        onSectionChange={handleSectionChange}
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
              conversations,
              onCloseConversation: closeSelectedConversation,
              onOpenHome: openFriendsHome,
              directoryUsers,
              selectedUserId,
              onUserSelect: selectConversationById,
              unreadByUserId: unreadByPeerIdWithCalls,
              friends,
              callState: callState,
              presenceStatus: selectedPresenceStatus,
              onPresenceStatusChange: setSelectedPresenceStatus,
              isAddFriendOpen,
              onAddFriendOpenChange: setIsAddFriendOpen,
            }}
            lobbiesProps={{
              lobbiesQuery,
              lobbies,
              lobbyMembersById,
              avatarByUserId,
              activeLobbyId: isInCallRoom ? null : activeLobbyId,
              openTextRoomId: openTextRoom?.id ?? null,
              joiningLobbyId,
              onJoinLobby: handleSelectLobby,
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
            videoQualityProps={videoQuality}
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
                : (openTextRoom?.name ?? activeLobby?.name ?? null)
            }
            joiningLobbyId={joiningLobbyId}
            onJoinLobby={handleSelectLobby}
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
            selectedUser={resolvedSelectedUser}
            friendsHome={{
              friends,
              directoryUsers,
              onOpenConversation: selectConversation,
              onAddFriend: () => setIsAddFriendOpen(true),
              onInitiateCall: handleInitiateCall,
            }}
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
        uplinkHeadroomBps={mediaStats.availableOutgoingBitrateBps}
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
