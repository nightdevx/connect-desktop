import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@shared/auth-contracts";
// One import per feature, through its front door. This file is the composition
// root — it is the only place allowed to know about every feature at once, and
// the price of that privilege is that it touches each one only where that
// feature says it may. scripts/check-architecture.cjs enforces it.
import { AdminPanel } from "@/features/admin";
import { isAdminRole } from "@/features/auth";
import { useLivekitSession } from "@/features/livekit";
import {
  ScreenShareModal,
  SCREEN_SHARE_QUALITY_OPTIONS,
} from "@/features/screen-share";
import { soundEffectManager } from "@/features/sound-effects";
import {
  CallDock,
  CameraShareModal,
  LobbyPasswordPromptModal,
  QuickControls,
  WorkspaceMainPanel,
  WorkspaceRail,
  WorkspaceSidebar,
  createLobbyTransitionState,
  useBlockedUsers,
  useCallSession,
  useDirectMessages,
  useFriends,
  useLobbyRoom,
  useLobbyUnread,
  useMediaDevices,
  useNetworkReconnect,
  useOpenConversations,
  usePresenceStatus,
  useRemoteParticipantAudio,
  useRoomTransitions,
  useScreenSubscriptions,
  useUserCards,
  useVoiceHotkeys,
  useWorkspaceAudioCues,
  useWorkspaceLobbies,
  useWorkspaceLobbyActions,
  useWorkspaceMediaControls,
  useWorkspacePreferences,
  useWorkspaceUsers,
  workspaceService,
  type AudioPreferences,
  type LobbyTransitionState,
  type ScheduleActiveLobbyReconnect,
} from "@/features/workspace";
import { useUiStore, type WorkspaceSection } from "@/store/ui-store";
import { useConversationRouting } from "./workspace-shell/use-conversation-routing";
import { useLobbyMembershipWatchdog } from "./workspace-shell/use-lobby-membership-watchdog";
import { useCallRoomSync } from "./workspace-shell/use-call-room-sync";
import { useAudioPreferenceSync } from "./workspace-shell/use-audio-preference-sync";
import { useDesktopPreferences } from "./workspace-shell/use-desktop-preferences";
import { useLobbyEmotePlayback } from "./workspace-shell/use-lobby-emote-playback";
import { useGameActivitySync } from "@/features/minigames";

// A Record over the union rather than a chain of ifs ending in a fallback.
// The chain was, in its own words, "the one failure the type system cannot
// see", and it duly happened: the games section was added, nothing updated
// this, and both the sidebar and the panel header read "Lobiler" on the games
// page. A missing key is now a compile error.
//
// "admin" is here for completeness even though the admin shell draws its own
// chrome -- the union is what has to be covered, not the sections that happen
// to reach this header today.
const SECTION_TITLES: Record<WorkspaceSection, string> = {
  users: "Arkadaşlar",
  lobbies: "Lobiler",
  "free-games": "Ücretsiz Oyunlar",
  minigames: "Oyunlar",
  settings: "Ayarlar",
  admin: "Yönetim",
};

interface WorkspaceShellProps {
  currentUserId: string;
  currentUsername: string;
  currentUserRole: UserRole;
  onLogout: () => void;
  isLoggingOut: boolean;
}

function WorkspaceShell({
  currentUserId,
  currentUsername,
  currentUserRole,
  onLogout,
  isLoggingOut,
}: WorkspaceShellProps) {
  const queryClient = useQueryClient();

  // ----- UI STORE -----
  const workspaceSection = useUiStore((state) => state.workspaceSection);
  const settingsSection = useUiStore((state) => state.settingsSection);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  // Read here as well as in the lobbies panel: whether the chat column is on
  // screen is what decides if an arriving message counts as unread.
  const isLobbyChatOpen = useUiStore(
    (state) => state.viewPreferences.lobbyChatOpen,
  );
  const setViewPreference = useUiStore((state) => state.setViewPreference);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setFreeGamesFilter = useUiStore((state) => state.setFreeGamesFilter);
  const setStatus = useUiStore((state) => state.setStatus);

  // An admin lands on the admin panel when the workspace opens. ONCE — this
  // used to re-run on every change of the role, which was harmless only while
  // the role could not change without a restart. It can now (the users socket
  // writes it straight into the session), and re-running it would teleport
  // somebody who was just promoted out of the room they are sitting in.
  const hasLandedRef = useRef(false);
  useEffect(() => {
    if (hasLandedRef.current) {
      return;
    }
    hasLandedRef.current = true;

    if (isAdminRole(currentUserRole)) {
      setWorkspaceSection("admin");
    }
  }, [currentUserRole, setWorkspaceSection]);

  // The other direction: demoted while the admin panel is open. The rail entry
  // disappears on its own, but the panel it points at is selected by
  // workspaceSection, so without this the person keeps looking at a dashboard
  // whose every request the server now refuses.
  useEffect(() => {
    if (workspaceSection === "admin" && !isAdminRole(currentUserRole)) {
      setWorkspaceSection("lobbies");
    }
  }, [currentUserRole, workspaceSection, setWorkspaceSection]);

  // The two chat hooks take a narrow union and use it as a gate, so every
  // section that is neither Arkadaşlar nor Lobiler has to arrive as the value
  // that gates nothing: "settings". Admin is mapped separately at each call
  // site, where it has always leaned on a neighbouring section.
  const sectionForChatHooks: "users" | "lobbies" | "settings" =
    workspaceSection === "users" || workspaceSection === "lobbies"
      ? workspaceSection
      : "settings";
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

  // Filled in below, once the lobby list exists. The notification listener is
  // registered long before that and must not be re-registered when the list
  // changes, so it reaches this through a ref the same way conversation
  // routing does.
  const selectTextRoomFromNotificationRef = useRef<(lobbyId: string) => void>(
    () => undefined,
  );

  // Filled in below for the same reason: a moderator can move this account into
  // another room at any moment, and the listener that hears about it is
  // registered long before the join path exists.
  const followModeratorMoveRef = useRef<(lobbyId: string) => void>(
    () => undefined,
  );

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

  // Open the output device before anything needs it.
  //
  // The first cue of a session used to pay for constructing the audio context
  // and waiting on the platform for an endpoint, at the exact moment it was
  // supposed to be heard — so the sound that confirms you joined a room was the
  // one most likely to arrive late or not at all. Primed on mount, and again on
  // the first click, because a context created before any user gesture can
  // still be born suspended.
  useEffect(() => {
    soundEffectManager.prime();

    const primeOnGesture = (): void => soundEffectManager.prime();
    window.addEventListener("pointerdown", primeOnGesture, { once: true });
    window.addEventListener("keydown", primeOnGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", primeOnGesture);
      window.removeEventListener("keydown", primeOnGesture);
    };
  }, []);

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
  //
  // The media session is created before the lobby hooks that own the reconnect
  // scheduler, and it needs to call into that scheduler when the transport
  // drops. A ref bridges the ordering; typing it is what stops the two sides
  // from drifting apart silently.
  const activeLobbyReconnectProxyRef = useRef<ScheduleActiveLobbyReconnect | null>(
    null,
  );
  // Filled in by the membership watchdog further down. The reconnect scheduler
  // calls it when a background re-join is refused for good — a ban, a deleted
  // room — so the loop stops and the user is told once, properly.
  const membershipDepartureRef = useRef<
    ((lobbyId: string, reason: string) => void) | null
  >(null);
  const scheduleActiveLobbyReconnectProxy = useCallback<ScheduleActiveLobbyReconnect>(
    (reason, immediate) => {
      activeLobbyReconnectProxyRef.current?.(reason, immediate);
    },
    [],
  );

  const {
    liveKitSessionRef,
    remoteParticipantStreams,
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
    activeNoiseSuppressionMode,
    remoteParticipantAudioPreferencesRef,
    activeSpeakerIds,
    liveKitConnectionState,
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
    setEmoteMuted: handleSetRemoteParticipantEmoteMuted,
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
    directoryUsersWithSelf,
    selectedUser,
    // No workspaceSection: the directory and its stream now run for the whole
    // session rather than only while a particular tab is open.
  } = useWorkspaceUsers({ currentUsername, currentUserId });

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

  const {
    peerNamesRef,
    conversationPeer,
    selectConversation,
    selectConversationById,
    selectConversationByIdRef,
    openConversationFromRoster,
    closeSelectedConversation,
    openFriendsHome,
    handleSectionChange,
    resolvedSelectedUser,
    directoryPeerUserIds,
    directoryAvatarByUserId,
    currentUserAvatarUrl,
  } = useConversationRouting({
    currentUserId,
    directoryUsers,
    directoryUsersWithSelf,
    callPeerUser: callState.peerUser ?? null,
    callStatus: callState.status,
    conversations,
    isConversationOpen,
    openConversation,
    closeConversation,
    selectedUserId,
    setSelectedUserId,
    selectedUser,
    setWorkspaceSection,
  });

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
    // Ücretsiz Oyunlar behaves like Ayarlar here, not like Lobiler: it is a
    // page you read, not a chat surface. "settings" is the inert value — it
    // gates nothing on — so the room's backfill poll pauses exactly as it
    // does in Ayarlar while the websocket keeps pushing into the cache.
    // (admin keeps mapping to "lobbies", which is what it has always done.)
    workspaceSection:
      workspaceSection === "admin" ? "lobbies" : sectionForChatHooks,
    setStatus,
  });

  // ----- MEDIA CONTROLS -----
  const {
    micEnabled,
    micLocked,
    headphoneEnabled,
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
  //
  // `speaking` is deliberately false on both rows and activeSpeakerIds is not a
  // dependency. This list is a ROSTER; useLobbyParticipants owns the speaking
  // state and overwrites whatever is set here, so computing it twice only meant
  // rebuilding every member object — and re-rendering every tile in the call —
  // each time the speaker list changed, which is several times a second while
  // anyone talks.
  const callMembers = useMemo(() => {
    if (!activeLobbyId?.startsWith("call_") || !callState.peerUser) return [];

    const localMember = {
      userId: currentUserId,
      username: currentUsername,
      joinedAt: new Date().toISOString(),
      muted: !micEnabled,
      serverMuted: false,
      deafened: !headphoneEnabled,
      speaking: false,
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
        speaking: false,
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
  ]);


  useAudioPreferenceSync({
    audioPreferences,
    activeLobbyId,
    micEnabled,
    liveKitSessionRef,
    setStatus,
  });

  // ----- HOTKEYS + PUSH-TO-TALK -----
  const desktopPreferences = useDesktopPreferences();

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
      if (payload.kind === "free-game") {
        // Raised by main's poller, so there is no conversation to open —
        // just the page the toast was about, on the bucket it was about.
        setWorkspaceSection("free-games");
        setFreeGamesFilter("free-now");
        return;
      }

      if (payload.kind === "lobby-message") {
        // Deliberately does not join anything: the toast says a room is
        // talking, and joining a voice lobby because a toast was clicked is not
        // something the click asked for. Show the room list with the chat
        // column open; a text room the user can already read opens outright.
        setWorkspaceSection("lobbies");
        setViewPreference("lobbyChatOpen", true);
        if (payload.lobbyId) {
          selectTextRoomFromNotificationRef.current(payload.lobbyId);
        }
        return;
      }

      if (!payload.peerUserId) {
        return;
      }
      selectConversationByIdRef.current(payload.peerUserId);
    });
  }, [
    selectConversationByIdRef,
    setWorkspaceSection,
    setViewPreference,
    setFreeGamesFilter,
  ]);

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
  // Whether the lobby websocket is currently delivering snapshots. Owned here
  // rather than inside useWorkspaceLobbies because the query below is created
  // first and that hook takes it as a parameter.
  const [isLobbyStreamLive, setIsLobbyStreamLive] = useState(false);

  // REST seeds the list and covers the stream being down. It does not run while
  // the stream is up: use-workspace-lobbies discards any REST answer that lands
  // after the first snapshot, so with `enabled` keyed only on the tab, leaving
  // Lobbies and coming back re-read the whole list for the sole purpose of
  // throwing it away. The stream dropping flips this back and the query
  // refetches on its own, because its data is stale by then.
  const lobbiesQuery = useQuery({
    queryKey: ["workspace-lobbies"],
    queryFn: () => workspaceService.listLobbies(),
    enabled: workspaceSection === "lobbies" && !isLobbyStreamLive,
    staleTime: 15_000,
  });

  // One lock, claimed by the manual join/leave paths and respected by the
  // background reconnect. Declared here because the two hooks that share it are
  // instantiated in a fixed order — which is exactly why this used to be passed
  // to the first of them as two literals, leaving the interlock permanently
  // open. A ref has a stable identity from the first render, so the ordering no
  // longer matters.
  const lobbyTransitionRef = useRef<LobbyTransitionState>(
    createLobbyTransitionState(),
  );

  const activeLobbyReconnectInFlightRef = useRef(false);
  const activeLobbyReconnectAttemptRef = useRef(0);
  // The password the user actually entered for the room they are in, so an
  // automatic re-join can present it. Without it every unattended recovery into
  // a password-protected room failed with LOBBY_PASSWORD_REQUIRED forever.
  // Never persisted: it lives as long as the membership does.
  const activeLobbyPasswordRef = useRef<string | null>(null);

  const {
    knownLobbies: lobbies,
    setKnownLobbies,
    lobbyMembersById,
    clearActiveLobbyReconnectTimer,
    scheduleActiveLobbyReconnect,
    hasLiveSnapshotRef,
  } = useWorkspaceLobbies({
    isOnline,
    shouldEmitReconnectStatus,
    setStatus,
    activeLobbyId,
    lobbyTransitionRef,
    activeLobbyReconnectInFlightRef,
    activeLobbyReconnectAttemptRef,
    performPostJoinSynchronization,
    lobbiesQuery,
    kickedLobbyIdRef,
    activeLobbyPasswordRef,
    onLobbyStreamLiveChange: setIsLobbyStreamLive,
    membershipDepartureRef,
  });

  useEffect(() => {
    activeLobbyReconnectProxyRef.current = scheduleActiveLobbyReconnect;
  }, [scheduleActiveLobbyReconnect]);

  // Everyone with a roster row on screen, across every lobby the sidebar lists.
  // Their cards are what supply an avatar for a non-friend: without this a
  // voice room was a wall of grey initials until you added each person, because
  // the only avatar source was the friends-only directory.
  const rosterUserIds = useMemo(() => {
    const userIds = new Set<string>();
    for (const members of Object.values(lobbyMembersById)) {
      for (const member of members) {
        userIds.add(member.userId);
      }
    }
    return [...userIds];
  }, [lobbyMembersById]);

  const rosterCardByUserId = useUserCards(rosterUserIds);

  // Cards first, directory over the top: for a friend the directory entry is
  // the live one (the users-WS pushes profile edits into it), while the card is
  // a 5-minute cache. For everyone else the card is all there is.
  const avatarByUserId = useMemo(() => {
    const merged: Record<string, string | null | undefined> = {};
    for (const [userId, card] of Object.entries(rosterCardByUserId)) {
      merged[userId] = card.avatarUrl;
    }
    return { ...merged, ...directoryAvatarByUserId };
  }, [directoryAvatarByUserId, rosterCardByUserId]);

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
      // Still told, with nothing to reconcile. The moderator-mute lock hangs off
      // this call, and returning early here left the microphone button disabled
      // in the NEXT room — the roster that would have cleared it is one we are no
      // longer on.
      reconcileDeclaredAudioState(undefined, undefined, false);
      return;
    }

    reconcileDeclaredAudioState(self.muted, self.deafened, self.serverMuted);
  }, [activeLobbyRosterMembers, currentUserId, reconcileDeclaredAudioState]);

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
    // This one MATTERS, and the first version of it was wrong. The hook reads
    // `workspaceSection === "users"` as "the open conversation is on screen":
    // an incoming message from the selected peer is then marked read and
    // raises no toast and no unread badge. Folding Ücretsiz Oyunlar into
    // "users" therefore SWALLOWED direct messages while the user was reading
    // about giveaways. It maps to the inert value instead.
    workspaceSection:
      workspaceSection === "admin" ? "users" : sectionForChatHooks,
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


  // A Record over the union rather than a chain ending in a fallback. The
  // chain was "the one failure the type system cannot see", and it duly
  // happened: the games section was added, nothing here mentioned it, and both
  // the sidebar and the panel header read "Lobiler" on the games page. A
  // missing key is now a compile error.
  const sectionTitle = SECTION_TITLES[workspaceSection];

  // ----- SOUND CUES -----
  useWorkspaceAudioCues({
    activeLobbyId,
    currentUserId,
    lobbyMembers: activeLobbyId?.startsWith("call_") ? callMembers : activeLobbyRosterMembers,
    remoteParticipantStreams,
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
    scheduleActiveLobbyReconnect,
    activeLobbyReconnectAttemptRef,
    activeLobbyReconnectInFlightRef,
    resetLocalMediaCapture,
    liveKitSessionRef,
    kickedLobbyIdRef,
    lobbyTransitionRef,
    activeLobbyPasswordRef,
    hasLiveSnapshotRef,
  });

  // ----- AUTOMATIC CALL ROOM LIVEKIT CONNECTION -----
  // The ref it returns is no longer read here: the membership watchdog used to
  // take it to re-run the sync after its own re-join probe, and that probe is
  // gone — the reconnect scheduler owns both halves now. The hook itself still
  // earns its place, it is what brings a 1:1 call room up.
  useCallRoomSync({
    activeLobbyId,
    performPostJoinSynchronization,
  });

  // ----- STAYING IN A ROOM YOU DID NOT LEAVE -----
  useLobbyMembershipWatchdog({
    activeLobbyId,
    currentUserId,
    lobbyMembersById,
    activeLobbyRef,
    kickedLobbyIdRef,
    activeLobbyPasswordRef,
    lobbyTransitionRef,
    leaveActiveLobby,
    followModeratorMoveRef,
    scheduleActiveLobbyReconnect,
    membershipDepartureRef,
  });

  useLobbyEmotePlayback(
    activeLobbyRef,
    queryClient,
    remoteParticipantAudioPreferencesRef,
  );

  useGameActivitySync(Boolean(currentUserId));

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

  // Following a move is an ordinary join, deliberately: the server has already
  // put this account in the destination, so this brings the media across and
  // re-declares mic/camera the same way clicking the room would. Going through
  // the same funnel is also what tears the old room down first — otherwise the
  // client would hold two LiveKit rooms at once.
  useEffect(() => {
    followModeratorMoveRef.current = (lobbyId: string): void => {
      // Ahead of the join, and synchronously: the SFU eviction for the old room
      // is already in flight, and without this it lands as "you were removed
      // from the voice room" one second before arriving in the new one.
      liveKitSessionRef.current?.expectRoomChange();
      handleSelectLobby(lobbyId);
    };
  });

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

  // ----- LOBBY CHAT UNREAD -----
  useEffect(() => {
    selectTextRoomFromNotificationRef.current = (lobbyId: string): void => {
      if (lobbies.find((lobby) => lobby.id === lobbyId)?.isTextOnly) {
        setOpenTextRoomId(lobbyId);
      }
    };
  });

  const lobbyNameById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const lobby of lobbies) {
      names[lobby.id] = lobby.name;
    }
    return names;
  }, [lobbies]);

  // A text room has no stage to share the width with, so its chat is always on
  // screen; a voice lobby's chat is a column the user can collapse.
  const isLobbyChatOnScreen =
    workspaceSection === "lobbies" &&
    lobbyRoomId !== null &&
    (openTextRoom !== null || isLobbyChatOpen);

  const { unreadByLobbyId, totalUnread: totalUnreadLobbyMessages } =
    useLobbyUnread({
      currentUserId,
      currentUsername,
      visibleLobbyId: lobbyRoomId,
      isChatVisible: isLobbyChatOnScreen,
      lobbyNameById,
      suppressNotifications: effectivePresenceStatus === "dnd",
    });

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
        totalUnreadLobbyMessages={totalUnreadLobbyMessages}
        currentUserRole={currentUserRole}
        currentUsername={currentUsername}
        currentUserId={currentUserId}
        onLogout={onLogout}
        isLoggingOut={isLoggingOut}
      />

      {workspaceSection === "admin" ? (
        <AdminPanel currentUserId={currentUserId} />
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
              unreadByLobbyId,
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
              onOpenConversation: openConversationFromRoster,
              participantAudio: {
                preferences: remoteParticipantAudioPreferences,
                setMuted: handleSetRemoteParticipantMuted,
                setVolume: handleSetRemoteParticipantVolume,
                setEmoteMuted: handleSetRemoteParticipantEmoteMuted,
              },
            }}
            settingsProps={{
              settingsSection,
              setSettingsSection,
            }}
            liveKitConnectionState={liveKitConnectionState}
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
            micLocked={micLocked}
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
            unreadLobbyMessages={
              lobbyRoomId ? (unreadByLobbyId[lobbyRoomId] ?? 0) : 0
            }
            joiningLobbyId={joiningLobbyId}
            onJoinLobby={handleSelectLobby}
            onSetRemoteParticipantMuted={handleSetRemoteParticipantMuted}
            onSetRemoteParticipantVolume={handleSetRemoteParticipantVolume}
            onSetRemoteParticipantEmoteMuted={
              handleSetRemoteParticipantEmoteMuted
            }
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

      {/* Outside the admin/section branch above, so it is on screen whatever the
          rail is pointing at. Your microphone state, the way out of a room and a
          live screen share are not properties of the section you happen to be
          looking at -- and Ayarlar and Yönetim, the two that used to hide it,
          are exactly where you are least likely to notice you are still live. */}
      <QuickControls
        currentUsername={currentUsername}
        currentUserId={currentUserId}
        currentUserAvatarUrl={currentUserAvatarUrl}
        friends={friends}
        hasActiveLobby={hasActiveLobby}
        isLeavingLobby={isLeavingLobby}
        micEnabled={micEnabled}
        micLocked={micLocked}
        headphoneEnabled={headphoneEnabled}
        screenShareEnabled={screenEnabled}
        audioInputDevices={audioInputDevices}
        audioOutputDevices={audioOutputDevices}
        selectedAudioInputDeviceId={audioPreferences.selectedAudioInputDeviceId}
        selectedAudioOutputDeviceId={
          audioPreferences.selectedAudioOutputDeviceId
        }
        onSelectAudioInputDevice={handleSelectAudioInputDevice}
        onSelectAudioOutputDevice={handleSelectAudioOutputDevice}
        onToggleMic={handleMicToggle}
        onToggleHeadphone={handleHeadphoneToggle}
        onStopScreenShare={handleScreenToggle}
        onDisconnect={handleLeaveLobbyOrEndCall}
      />

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
        // The same stored preference Ayarlar → Kamera edits. Changing it here
        // restarts the preview on the new constraints, so the dialog shows what
        // it is about to publish rather than describing it.
        cameraPreferences={cameraPreferences}
        onChangeCameraPreferences={saveCameraPreferences}
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
