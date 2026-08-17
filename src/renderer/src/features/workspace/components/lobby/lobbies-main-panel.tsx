import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { message } from "antd";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage, LobbyDescriptor, UserRole } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbySoundEmote,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { ParticipantMediaMap, RemoteParticipantAudioPreference } from "@/features/livekit";
import { getApiErrorMessage } from "../../workspace-utils";
import { canManageLobby } from "@/features/auth/permissions";
import workspaceService from "../../services";
import { LobbyChatPanel } from "./lobby-chat-panel";
import { ConfirmActionModal } from "../common";
import { UserProfileCardAnchor } from "../user/user-profile-card";
import type { FriendsController } from "../../hooks/user/use-friends";
import { fetchUserCard } from "../../hooks/user/use-user-cards";
import type { PendingAttachment } from "../../hooks/chat/use-direct-messages";
import { useLobbyStageLayout } from "./lobby-stage-layout";
import { type LobbyParticipantView } from "./lobby-participant-tile";

// Modular Imports
import { useLobbyParticipants } from "./hooks/use-lobby-participants";
import { useLobbyStageSlots } from "./hooks/use-lobby-stage-slots";
import { LobbySelectionScreen } from "./parts/LobbySelectionScreen";
import { LobbyActionToolbar } from "./parts/LobbyActionToolbar";
import { LobbyStageView } from "./parts/LobbyStageView";
import { ParticipantContextMenu } from "./parts/ParticipantContextMenu";

interface LobbiesMainPanelProps {
  lobbiesCount: number;
  lobbies: LobbyDescriptor[];
  activeLobbyId: string | null;
  activeLobbyName: string | null;
  currentUserId: string;
  currentUsername: string;
  currentUserRole: UserRole;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteParticipantStreams: ParticipantMediaMap;
  remoteParticipantAudioPreferences: Record<string, RemoteParticipantAudioPreference>;
  activeSpeakerIds: string[];
  avatarByUserId: Record<string, string | null | undefined>;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
  onSetRemoteParticipantMuted: (participantUserId: string, muted: boolean) => void;
  onSetRemoteParticipantVolume: (participantUserId: string, volumePercent: number) => void;
  onSetRemoteParticipantCameraHidden: (participantUserId: string, hidden: boolean) => void;
  onSetRemoteParticipantScreenAudioMuted: (participantUserId: string, muted: boolean) => void;
  onSetRemoteParticipantScreenAudioVolume: (participantUserId: string, volumePercent: number) => void;
  lobbyStateQuery: UseQueryResult<DesktopResult<{ lobbyId: string; members: LobbyStateMember[]; size: number; revision: number; }>, Error>;
  lobbyMessagesQuery: UseQueryResult<DesktopResult<{ messages: ChatMessage[] }>, Error>;
  lobbyMembers: LobbyStateMember[];
  lobbyMessages: ChatMessage[];
  lobbyMessageDraft: string;
  setLobbyMessageDraft: Dispatch<SetStateAction<string>>;
  // Optional body override, forwarded verbatim to LobbyChatPanel's GIF button.
  // `() => void` is assignable to this, so a stale signature here compiles and
  // silently drops the URL at runtime.
  onSendLobbyMessage: (bodyOverride?: string) => void;
  onDeleteLobbyMessage: (messageId: string) => void;
  isSendingLobbyMessage: boolean;
  deletingLobbyMessageId: string | null;
  lobbyReplyTo: ChatMessage | null;
  onSetLobbyReplyTo: (message: ChatMessage | null) => void;
  lobbyPendingAttachment: PendingAttachment | null;
  onSetLobbyPendingAttachment: (value: PendingAttachment | null) => void;
  onEditLobbyMessage: (messageId: string, body: string) => void;
  onToggleLobbyReaction: (
    messageId: string,
    emoji: string,
    add: boolean,
  ) => void;
  lobbySearchQuery: string;
  lobbySearchResults: ChatMessage[] | null;
  isSearchingLobbyMessages: boolean;
  onRunLobbySearch: (query: string) => void;
  onClearLobbySearch: () => void;
  isLeavingLobby: boolean;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onLeaveLobby: () => void;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
  // Screen shares are opt-in; nothing is subscribed until the viewer asks.
  isWatchingScreen: (userId: string) => boolean;
  onWatchScreen: (userId: string) => void;
  onStopWatchingScreen: (userId: string) => void;
  // A voice room is full of people you may not be friends with yet, and the
  // participant menu is the only surface that names them here.
  friends: FriendsController;
}

const DEFAULT_REMOTE_AUDIO_PREFERENCE: RemoteParticipantAudioPreference = {
  muted: false,
  volumePercent: 100,
};

export function LobbiesMainPanel({
  lobbiesCount,
  lobbies,
  activeLobbyId,
  activeLobbyName,
  currentUserId,
  currentUsername,
  currentUserRole,
  micEnabled,
  headphoneEnabled,
  cameraEnabled,
  screenEnabled,
  localCameraStream,
  localScreenStream,
  remoteParticipantStreams,
  remoteParticipantAudioPreferences,
  activeSpeakerIds,
  avatarByUserId,
  joiningLobbyId,
  onJoinLobby,
  onSetRemoteParticipantMuted,
  onSetRemoteParticipantVolume,
  onSetRemoteParticipantCameraHidden,
  onSetRemoteParticipantScreenAudioMuted,
  onSetRemoteParticipantScreenAudioVolume,
  lobbyStateQuery,
  lobbyMessagesQuery,
  lobbyMembers,
  lobbyMessages,
  lobbyMessageDraft,
  setLobbyMessageDraft,
  onSendLobbyMessage,
  onDeleteLobbyMessage,
  isSendingLobbyMessage,
  deletingLobbyMessageId,
  lobbyReplyTo,
  onSetLobbyReplyTo,
  lobbyPendingAttachment,
  onSetLobbyPendingAttachment,
  onEditLobbyMessage,
  onToggleLobbyReaction,
  lobbySearchQuery,
  lobbySearchResults,
  isSearchingLobbyMessages,
  onRunLobbySearch,
  onClearLobbySearch,
  isLeavingLobby,
  onToggleMic,
  onToggleHeadphone,
  onToggleScreen,
  onToggleCamera,
  onLeaveLobby,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  isWatchingScreen,
  onWatchScreen,
  onStopWatchingScreen,
  friends,
}: LobbiesMainPanelProps) {
  const queryClient = useQueryClient();
  const [isLobbyChatOpen, setIsLobbyChatOpen] = useState(true);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [isRailVisible, setIsRailVisible] = useState(true);
  const [contextMenuParticipantId, setContextMenuParticipantId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [localFallbackJoinedAt, setLocalFallbackJoinedAt] = useState<string>(() => new Date().toISOString());
  // use-friends deliberately keeps no pending marker for sendRequest — it is
  // keyed by username and there is no user id to hang one on until the server
  // answers — so the caller owns it, and here it is what stops a second click
  // from sending the same request twice.
  const [sendingFriendRequestIds, setSendingFriendRequestIds] = useState<string[]>([]);
  const [pendingUnfriend, setPendingUnfriend] = useState<{ userId: string; name: string } | null>(null);
  // The profile card opened from the stage. Position is kept with it so the
  // card appears where the right-click was, not where the tile happens to be
  // after the grid reflows.
  const [profileCardTarget, setProfileCardTarget] = useState<
    { userId: string; name: string; x: number; y: number } | null
  >(null);

  // 1. Participant Logic Hook
  const { lobbyParticipants } = useLobbyParticipants({
    lobbyMembers,
    currentUserId,
    currentUsername,
    activeLobbyId,
    activeSpeakerIds,
    remoteParticipantStreams,
    micEnabled,
    headphoneEnabled,
    cameraEnabled,
    screenEnabled,
    localFallbackJoinedAt,
  });

  // 2. Stage Slots Hook
  const { stageParticipantSlots } = useLobbyStageSlots({
    lobbyParticipants,
    activeLobbyId,
  });

  const effectiveParticipantCount = useMemo(() => {
    if (focusedParticipantId && !isRailVisible) {
      return 1;
    }
    return stageParticipantSlots.length;
  }, [focusedParticipantId, isRailVisible, stageParticipantSlots.length]);

  const { stagePanelRef, stageLayoutStyle } = useLobbyStageLayout(
    effectiveParticipantCount,
    isLobbyChatOpen,
  );

  // Sync Effects
  useEffect(() => {
    setIsLobbyChatOpen(true);
    setFocusedParticipantId(null);
    setContextMenuParticipantId(null);
    setContextMenuPosition(null);
    setProfileCardTarget(null);
    setIsRailVisible(true);
  }, [activeLobbyId]);

  useEffect(() => {
    setIsRailVisible(true);
  }, [focusedParticipantId]);

  useEffect(() => {
    if (!activeLobbyId) return;
    setLocalFallbackJoinedAt(new Date().toISOString());
  }, [activeLobbyId]);

  useEffect(() => {
    if (!focusedParticipantId && !contextMenuParticipantId) return;
    if (focusedParticipantId) {
      const focusedStillPresent = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === focusedParticipantId);
      if (!focusedStillPresent) setFocusedParticipantId(null);
    }
    if (contextMenuParticipantId) {
      const stillPresent = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === contextMenuParticipantId);
      if (!stillPresent) setContextMenuParticipantId(null);
    }
  }, [contextMenuParticipantId, focusedParticipantId, lobbyParticipants]);

  // Derived Values
  const selectedPreference = contextMenuParticipantId
    ? (remoteParticipantAudioPreferences[contextMenuParticipantId] ?? DEFAULT_REMOTE_AUDIO_PREFERENCE)
    : DEFAULT_REMOTE_AUDIO_PREFERENCE;

  const activeLobby = useMemo(
    () => lobbies.find((lobby) => lobby.id === activeLobbyId) ?? null,
    [lobbies, activeLobbyId],
  );
  const canModerate = canManageLobby(activeLobby?.createdBy ?? "", currentUserId, currentUserRole);

  // A text room has no stage, no roster and no toolbar: the chat is the entire
  // room and there is nothing to toggle it against. Nothing here leaves it
  // either — a text room is never joined, so "leaving" is just clicking
  // somewhere else. That is also why LobbyActionToolbar must stay inside this
  // branch: its leave button, and the sidebar's disconnect, belong to the voice
  // lobby that may well still be running underneath this chat.
  const isTextOnly = activeLobby?.isTextOnly ?? false;

  const handleServerMuteParticipant = (): void => {
    if (!activeLobbyId || !contextMenuParticipantId) return;
    const targetId = contextMenuParticipantId;
    const targetName = lobbyParticipants.find((p) => p.userId === targetId)?.username ?? targetId;
    const nextMuted = !(lobbyMembers.find((m) => m.userId === targetId)?.serverMuted ?? false);
    void workspaceService.muteLobbyMember({ lobbyId: activeLobbyId, userId: targetId, muted: nextMuted }).then((result) => {
      if (result.ok) {
        message.success(nextMuted ? `${targetName} susturuldu` : `${targetName} sesi açıldı`);
      } else {
        message.error(getApiErrorMessage(result.error));
      }
    });
  };

  const handleKickParticipant = (): void => {
    if (!activeLobbyId || !contextMenuParticipantId) return;
    const targetId = contextMenuParticipantId;
    const targetName = lobbyParticipants.find((p) => p.userId === targetId)?.username ?? targetId;
    void workspaceService.kickLobbyMember({ lobbyId: activeLobbyId, userId: targetId }).then((result) => {
      if (result.ok) {
        message.success(`${targetName} odadan atıldı`);
      } else {
        message.error(getApiErrorMessage(result.error));
      }
    });
  };

  const contextMenuParticipant = useMemo(
    () => lobbyParticipants.find((p) => p.userId === contextMenuParticipantId) ?? null,
    [contextMenuParticipantId, lobbyParticipants],
  );

  const contextMenuFriendState = useMemo<
    "friend" | "requested" | "none" | undefined
  >(() => {
    if (!contextMenuParticipant) return undefined;
    if (friends.friendIds.includes(contextMenuParticipant.userId)) return "friend";
    if (friends.outgoingRequests.some((entry) => entry.userId === contextMenuParticipant.userId)) {
      return "requested";
    }
    // An incoming request deliberately still reads "Arkadaş Ekle": sending back
    // collapses the two into the single edge that was already there, and the
    // server answers with accepted.
    return "none";
  }, [contextMenuParticipant, friends.friendIds, friends.outgoingRequests]);

  const handleAddParticipantFriend = (): void => {
    const participant = contextMenuParticipant;
    if (!participant) return;

    const { userId } = participant;
    setSendingFriendRequestIds((previous) => [...previous, userId]);

    // The handle is resolved from the public card, NOT from participant.username.
    //
    // The lobby roster carries auth.DisplayNameOf(user) in its `username` field
    // — the display name, falling back to the handle only when there is none —
    // while the send-request route is keyed by the real username. So for every
    // member who had ever set a display name this menu answered "Kullanıcı
    // bulunamadı", and for everyone who had not it happened to work. Served
    // from the card cache the roster already primed, so it is normally free.
    void fetchUserCard(queryClient, userId)
      .then((card) => {
        if (!card?.username) {
          return { ok: false, message: "Kullanıcı profili alınamadı." };
        }
        return friends.sendRequest(card.username);
      })
      .then((result) => {
        // Already Turkish: use-friends maps the server's codes before it
        // returns, so there is nothing to translate here.
        if (result.ok) {
          message.success(result.message);
        } else {
          message.error(result.message);
        }
      })
      .finally(() => {
        setSendingFriendRequestIds((previous) => previous.filter((id) => id !== userId));
      });
  };

  const handleRemoveParticipantFriend = (): void => {
    if (!contextMenuParticipant) return;
    setPendingUnfriend({
      userId: contextMenuParticipant.userId,
      name: contextMenuParticipant.username || "Bu kullanıcı",
    });
  };

  const focusedParticipantSlot = useMemo(
    () => (focusedParticipantId ? (stageParticipantSlots.find((slot) => slot.participant.userId === focusedParticipantId) ?? null) : null),
    [focusedParticipantId, stageParticipantSlots],
  );

  const nonFocusedParticipantSlots = useMemo(
    () => (focusedParticipantId ? stageParticipantSlots.filter((slot) => slot.participant.userId !== focusedParticipantId) : stageParticipantSlots),
    [focusedParticipantId, stageParticipantSlots],
  );

  // Handlers
  const handleParticipantFocus = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView): void => {
    if (participant.isLocalUser) return;
    event.stopPropagation();
    setContextMenuParticipantId(null);
    setContextMenuPosition(null);
    setFocusedParticipantId((prev) => (prev === participant.userId ? null : participant.userId));
  };

  // Watching a share also focuses it. Subscribing on its own left the stream in
  // a ~380px grid tile, and adaptive streaming sizes the delivered layer to the
  // element it is rendered in — so asking to watch a 1080p share got you its
  // 480x270 layer, on which no text is legible. Focusing gives it the stage,
  // which is what makes the SFU send the top layer.
  const handleWatchScreen = (userId: string): void => {
    onWatchScreen(userId);
    setFocusedParticipantId(userId);
  };

  const handleParticipantContextMenu = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView): void => {
    if (participant.isLocalUser) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenuParticipantId(participant.userId);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  // Nothing is played here. The sound comes back over the lobby stream like it
  // does for everyone else, so the sender hears exactly what the room heard —
  // and hears nothing when the server refused (rate limit, no longer a member),
  // which is precisely when a local preview would have lied.
  const handleSendEmote = (emote: string): void => {
    if (!activeLobbyId) return;
    void workspaceService
      .sendLobbyEmote({ lobbyId: activeLobbyId, emote })
      .then((result) => {
        if (!result.ok) {
          message.error(getApiErrorMessage(result.error));
        }
      });
  };

  const handleMute = (muted: boolean): void => {
    if (!contextMenuParticipantId) return;
    onSetRemoteParticipantMuted(contextMenuParticipantId, muted);
  };

  const handleVolume = (volumePercent: number): void => {
    if (!contextMenuParticipantId) return;
    onSetRemoteParticipantVolume(contextMenuParticipantId, volumePercent);
  };

  const handleToggleCameraHidden = (hidden: boolean): void => {
    if (!contextMenuParticipantId) return;
    onSetRemoteParticipantCameraHidden(contextMenuParticipantId, hidden);
  };

  const handleScreenAudioMute = (muted: boolean): void => {
    if (!contextMenuParticipantId) return;
    onSetRemoteParticipantScreenAudioMuted(contextMenuParticipantId, muted);
  };

  const handleScreenAudioVolume = (volumePercent: number): void => {
    if (!contextMenuParticipantId) return;
    onSetRemoteParticipantScreenAudioVolume(contextMenuParticipantId, volumePercent);
  };

  return (
    <div className="ct-lobby-main-stack">
      {/* 1. Lobby Selection Screen */}
      <LobbySelectionScreen
        activeLobbyId={activeLobbyId}
        lobbiesCount={lobbiesCount}
        lobbies={lobbies}
        joiningLobbyId={joiningLobbyId}
        onJoinLobby={onJoinLobby}
      />

      {/* 2. Active Lobby Room */}
      <article
        className={`ct-content-card ct-lobby-room-card connected ct-lobby-main-layer room ${activeLobbyId ? "" : "hidden-layer"}`}
      >
        <div
          className={`ct-lobby-room-grid-v2 ${isTextOnly ? "stage-closed" : isLobbyChatOpen ? "chat-open" : "chat-closed"}`}
        >
          {!isTextOnly && (
          <section className="ct-lobby-stage-panel" ref={stagePanelRef}>
            <button
              type="button"
              className="ct-lobby-chat-toggle in-stage"
              onClick={() => setIsLobbyChatOpen((prev) => !prev)}
            >
              {isLobbyChatOpen ? (
                <>
                  <RightOutlined  /> Sohbeti Kapat
                </>
              ) : (
                <>
                  <LeftOutlined  /> Sohbeti Aç
                </>
              )}
            </button>

            {/* Stage Loading & Error States */}
            {lobbyStateQuery.isPending && <div className="ct-list-state">Üye durumları yükleniyor...</div>}
            {!lobbyStateQuery.isPending && lobbyStateQuery.isError && (
              <div className="ct-list-state error">Üye durumları alınamadı: {lobbyStateQuery.error.message}</div>
            )}
            {!lobbyStateQuery.isPending && !lobbyStateQuery.isError && !lobbyStateQuery.data?.ok && (
              <div className="ct-list-state error">Üye durumları alınamadı: {getApiErrorMessage(lobbyStateQuery.data?.error)}</div>
            )}
            {!lobbyStateQuery.isPending && !lobbyStateQuery.isError && lobbyStateQuery.data?.ok && lobbyParticipants.length === 0 && (
              <div className="ct-list-state">Bu lobide henüz üye yok.</div>
            )}

            {/* Stage Participants Grid */}
            <LobbyStageView
              stageParticipantSlots={stageParticipantSlots}
              focusedParticipantSlot={focusedParticipantSlot}
              nonFocusedParticipantSlots={nonFocusedParticipantSlots}
              avatarByUserId={avatarByUserId}
              localCameraStream={localCameraStream}
              localScreenStream={localScreenStream}
              remoteParticipantStreams={remoteParticipantStreams}
              remoteParticipantAudioPreferences={remoteParticipantAudioPreferences}
              focusedParticipantId={focusedParticipantId}
              stageLayoutStyle={stageLayoutStyle}
              handleParticipantFocus={handleParticipantFocus}
              handleParticipantContextMenu={handleParticipantContextMenu}
              audioInputDevices={audioInputDevices}
              audioOutputDevices={audioOutputDevices}
              selectedAudioInputDeviceId={selectedAudioInputDeviceId}
              selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
              onSelectAudioInputDevice={onSelectAudioInputDevice}
              onSelectAudioOutputDevice={onSelectAudioOutputDevice}
              isRailVisible={isRailVisible}
              setIsRailVisible={setIsRailVisible}
              isWatchingScreen={isWatchingScreen}
              onWatchScreen={handleWatchScreen}
            />

            {/* Bottom Actions Toolbar */}
            <LobbyActionToolbar
              micEnabled={micEnabled}
              headphoneEnabled={headphoneEnabled}
              screenEnabled={screenEnabled}
              cameraEnabled={cameraEnabled}
              isLeavingLobby={isLeavingLobby}
              onToggleMic={onToggleMic}
              onToggleHeadphone={onToggleHeadphone}
              onToggleScreen={onToggleScreen}
              onToggleCamera={onToggleCamera}
              onLeaveLobby={onLeaveLobby}
              audioInputDevices={audioInputDevices}
              audioOutputDevices={audioOutputDevices}
              selectedAudioInputDeviceId={selectedAudioInputDeviceId}
              selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
              onSelectAudioInputDevice={onSelectAudioInputDevice}
              onSelectAudioOutputDevice={onSelectAudioOutputDevice}
              onSendEmote={handleSendEmote}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          </section>
          )}

          <aside className={`ct-lobby-chat-slot ${isTextOnly || isLobbyChatOpen ? "open" : ""}`}>
            <LobbyChatPanel
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              lobbyMembers={lobbyStateQuery.data?.data?.members}
              lobbyMessagesQuery={lobbyMessagesQuery}
              lobbyMessages={lobbyMessages}
              lobbyMessageDraft={lobbyMessageDraft}
              setLobbyMessageDraft={setLobbyMessageDraft}
              onSendLobbyMessage={onSendLobbyMessage}
              onDeleteLobbyMessage={onDeleteLobbyMessage}
              isSendingLobbyMessage={isSendingLobbyMessage}
              deletingLobbyMessageId={deletingLobbyMessageId}
              replyTo={lobbyReplyTo}
              onSetReplyTo={onSetLobbyReplyTo}
              pendingAttachment={lobbyPendingAttachment}
              onSetPendingAttachment={onSetLobbyPendingAttachment}
              onEditMessage={onEditLobbyMessage}
              onToggleReaction={onToggleLobbyReaction}
              searchQuery={lobbySearchQuery}
              searchResults={lobbySearchResults}
              isSearching={isSearchingLobbyMessages}
              onRunSearch={onRunLobbySearch}
              onClearSearch={onClearLobbySearch}
            />
          </aside>
        </div>
      </article>

      {/* Floating Context Menu - Rendered at root to avoid transform offsets */}
      {contextMenuParticipantId && contextMenuPosition && (
        <ParticipantContextMenu
          key={`context-menu-${contextMenuParticipantId}-${contextMenuPosition.x}-${contextMenuPosition.y}`}
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          preference={selectedPreference}
          isScreenSharing={
            lobbyMembers.find((m) => m.userId === contextMenuParticipantId)?.screenSharing ?? false
          }
          isServerMuted={
            lobbyMembers.find((m) => m.userId === contextMenuParticipantId)?.serverMuted ?? false
          }
          onClose={() => {
            setContextMenuParticipantId(null);
            setContextMenuPosition(null);
          }}
          onMute={handleMute}
          onVolume={handleVolume}
          onToggleCameraHidden={handleToggleCameraHidden}
          onScreenAudioMute={handleScreenAudioMute}
          onScreenAudioVolume={handleScreenAudioVolume}
          isWatchingScreen={contextMenuParticipantId ? isWatchingScreen(contextMenuParticipantId) : false}
          onSetScreenWatching={(watch) => {
            if (!contextMenuParticipantId) return;
            if (watch) onWatchScreen(contextMenuParticipantId);
            else onStopWatchingScreen(contextMenuParticipantId);
          }}
          canModerate={canModerate}
          onServerMute={handleServerMuteParticipant}
          onKick={handleKickParticipant}
          friendState={contextMenuFriendState}
          isFriendActionPending={
            contextMenuParticipantId !== null &&
            (friends.pendingUserIds.includes(contextMenuParticipantId) ||
              sendingFriendRequestIds.includes(contextMenuParticipantId))
          }
          onAddFriend={handleAddParticipantFriend}
          onRemoveFriend={handleRemoveParticipantFriend}
          onShowProfile={() => {
            if (!contextMenuParticipant || !contextMenuPosition) return;
            setProfileCardTarget({
              userId: contextMenuParticipant.userId,
              name: contextMenuParticipant.username,
              x: contextMenuPosition.x,
              y: contextMenuPosition.y,
            });
          }}
        />
      )}

      {profileCardTarget && (
        <UserProfileCardAnchor
          key={`profile-card-${profileCardTarget.userId}`}
          x={profileCardTarget.x}
          y={profileCardTarget.y}
          userId={profileCardTarget.userId}
          fallbackName={profileCardTarget.name}
          currentUserId={currentUserId}
          friends={friends}
          onClose={() => setProfileCardTarget(null)}
        />
      )}

      {/* Same confirmation the sidebar and the friends home put on it: the
          person doing it cannot undo it on their own. */}
      <ConfirmActionModal
        isOpen={pendingUnfriend !== null}
        title="Arkadaşlıktan Çıkar"
        message={`${pendingUnfriend?.name ?? ""} arkadaş listenizden kaldırılacak. Geri almak için karşı tarafın yeni isteğinizi kabul etmesi gerekir.`}
        confirmLabel="Arkadaşlıktan Çıkar"
        isProcessing={
          pendingUnfriend !== null &&
          friends.pendingUserIds.includes(pendingUnfriend.userId)
        }
        onConfirm={() => {
          if (!pendingUnfriend) return;
          void friends.removeFriend(pendingUnfriend.userId).then(() => {
            setPendingUnfriend(null);
          });
        }}
        onCancel={() => setPendingUnfriend(null)}
      />
    </div>
  );
}
