import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { Drawer, Input, Button, Tag, Divider, Descriptions, Avatar, Tooltip } from "antd";
import type { InputRef } from "antd";
import {
  SendOutlined,
  CopyOutlined,
  CalendarOutlined,
  SafetyOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  BellOutlined,
  BellFilled,
  LeftOutlined,
  RightOutlined,
  MessageOutlined,
  CloseOutlined,
  SearchOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { UserDirectoryEntry, ChatMessage } from "@shared/auth-contracts";
import type { UseDirectMessagesResult } from "../../hooks/chat/use-direct-messages";
import {
  formatDateLabel,
  getApiErrorMessage,
  getUserStatusLabel,
} from "../../workspace-utils";
import type { MentionCandidate } from "../../mentions";
import {
  MentionPicker,
  useMentionPicker,
} from "../common/mention-picker";
import { ConfirmActionModal } from "../common";
import { FriendsHomePanel, type FriendsHomePanelProps } from "./friends-home-panel";
import {
  ChatAttachButton,
  ChatComposerEmojiButton,
  ChatReplyQuote,
  formatAttachmentSize,
} from "../common/chat-message-parts";
import { ChatGifButton } from "../common/gif-picker";
import { useLobbyParticipants } from "../lobby/hooks/use-lobby-participants";
import { useLobbyStageSlots } from "../lobby/hooks/use-lobby-stage-slots";
import { LobbyStageView } from "../lobby/parts/LobbyStageView";
import { LobbyActionToolbar } from "../lobby/parts/LobbyActionToolbar";
import { ParticipantContextMenu } from "../lobby/parts/ParticipantContextMenu";
import { useLobbyStageLayout } from "../lobby/lobby-stage-layout";
import { type LobbyParticipantView } from "../lobby/lobby-participant-tile";
import { type StageParticipantSlot } from "../lobby/lobby-view-utils";
import type { ParticipantMediaMap, RemoteParticipantAudioPreference } from "@/features/livekit";
import type {
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { CallSessionState } from "../../hooks";
import type { OngoingCallInfo } from "../../hooks/user/use-call-session";
import workspaceService from "../../services";
import { useUiStore } from "@/store/ui-store";
import { DirectChatMessageRow } from "./direct-chat-message-row";
import { useThreadScroll } from "./use-thread-scroll";

// Mention matching, highlighting and "was I named" live in ../../mentions so the
// lobby composer and this message list share one set of rules. Re-exported
// because callers already import mentionsUser from here.
export { mentionsUser } from "../../mentions";


// Stable fallbacks for the optional media props below.
const EMPTY_SPEAKER_IDS: string[] = [];
const EMPTY_MEDIA_MAP: ParticipantMediaMap = {};

interface UsersDirectMessagesPanelProps {
  currentUserId: string;
  currentUserRole: string;
  selectedUser: UserDirectoryEntry | null;
  // The friends home stands in for a selected conversation, so everything it
  // needs arrives as one object the shell hands over in a single line. Optional
  // only so the shell can be wired after this panel; the empty state is gone.
  friendsHome?: Omit<FriendsHomePanelProps, "currentUserId">;
  onCopyUsername: (username: string) => Promise<void>;
  directMessagesQuery: UseDirectMessagesResult["directMessagesQuery"];
  directMessages: UseDirectMessagesResult["directMessages"];
  messageDraft: string;
  onMessageDraftChange: Dispatch<SetStateAction<string>>;
  // Throttled inside the hook; safe to call on every keystroke.
  onTyping?: () => void;
  isPeerTyping?: boolean;
  currentUsername?: string;
  isSelectedUserBlocked?: boolean;
  isBlockUpdating?: boolean;
  onToggleBlocked?: (userId: string) => Promise<void> | void;
  onLoadOlderMessages?: () => void;
  isLoadingOlderMessages?: boolean;
  hasMoreMessages?: boolean;
  // Sends the draft. With a body it sends that instead and leaves the draft
  // alone -- see the GIF button below for why that override has to exist.
  onSendMessage: (bodyOverride?: string) => void;
  onDeleteMessage: (messageId: string) => void;
  deletingMessageId: string | null;
  isSendingMessage: boolean;
  onInitiateCall?: (targetUser: UserDirectoryEntry) => void;

  // Reply / edit / reactions / attachments / search.
  replyTo?: ChatMessage | null;
  onSetReplyTo?: (message: ChatMessage | null) => void;
  pendingAttachment?: UseDirectMessagesResult["pendingAttachment"];
  onSetPendingAttachment?: UseDirectMessagesResult["setPendingAttachment"];
  onEditMessage?: (messageId: string, body: string) => void;
  onToggleReaction?: (messageId: string, emoji: string, add: boolean) => void;
  searchQuery?: string;
  searchResults?: ChatMessage[] | null;
  isSearching?: boolean;
  onRunSearch?: (query: string) => void;
  onClearSearch?: () => void;

  // Call & Media Props
  micEnabled?: boolean;
  headphoneEnabled?: boolean;
  cameraEnabled?: boolean;
  screenEnabled?: boolean;
  localCameraStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteParticipantStreams?: ParticipantMediaMap;
  remoteParticipantAudioPreferences?: Record<string, RemoteParticipantAudioPreference>;
  onSetRemoteParticipantMuted?: (participantUserId: string, muted: boolean) => void;
  onSetRemoteParticipantVolume?: (participantUserId: string, volumePercent: number) => void;
  onSetRemoteParticipantCameraHidden?: (participantUserId: string, hidden: boolean) => void;
  onSetRemoteParticipantScreenAudioMuted?: (participantUserId: string, muted: boolean) => void;
  onSetRemoteParticipantScreenAudioVolume?: (participantUserId: string, volumePercent: number) => void;
  activeSpeakerIds?: string[];
  avatarByUserId?: Record<string, string | null | undefined>;
  lobbyMembers?: LobbyStateMember[];
  onToggleMic?: () => void;
  onToggleHeadphone?: () => void;
  onToggleScreen?: () => void;
  onToggleCamera?: () => void;
  audioInputDevices?: MediaDeviceInfo[];
  audioOutputDevices?: MediaDeviceInfo[];
  selectedAudioInputDeviceId?: string | null;
  selectedAudioOutputDeviceId?: string | null;
  onSelectAudioInputDevice?: (deviceId: string | null) => void;
  onSelectAudioOutputDevice?: (deviceId: string | null) => void;
  isLeavingLobby?: boolean;
  activeLobbyId?: string | null;
  callState?: CallSessionState;
  ongoingCall?: OngoingCallInfo | null;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
  onCancelCall?: () => void;
  onEndActiveCall?: () => void;
  onRejoinCall?: () => void;
  // Screen shares are opt-in; nothing is subscribed until the viewer asks.
  isWatchingScreen?: (userId: string) => boolean;
  onWatchScreen?: (userId: string) => void;
  onStopWatchingScreen?: (userId: string) => void;
}

export function UsersDirectMessagesPanel({
  currentUserId,
  currentUserRole,
  selectedUser,
  friendsHome,
  onCopyUsername,
  directMessagesQuery,
  directMessages,
  messageDraft,
  onMessageDraftChange,
  onTyping,
  isPeerTyping = false,
  currentUsername = "",
  isSelectedUserBlocked = false,
  isBlockUpdating = false,
  onToggleBlocked,
  onLoadOlderMessages,
  isLoadingOlderMessages = false,
  hasMoreMessages = false,
  onSendMessage,
  onDeleteMessage,
  deletingMessageId,
  isSendingMessage,
  onInitiateCall,

  replyTo = null,
  onSetReplyTo,
  pendingAttachment = null,
  onSetPendingAttachment,
  onEditMessage,
  onToggleReaction,
  searchQuery = "",
  searchResults = null,
  isSearching = false,
  onRunSearch,
  onClearSearch,

  // Call & Media Props Destructuring
  micEnabled,
  headphoneEnabled,
  cameraEnabled,
  screenEnabled,
  localCameraStream,
  localScreenStream,
  remoteParticipantStreams,
  remoteParticipantAudioPreferences,
  onSetRemoteParticipantMuted,
  onSetRemoteParticipantVolume,
  onSetRemoteParticipantCameraHidden,
  onSetRemoteParticipantScreenAudioMuted,
  onSetRemoteParticipantScreenAudioVolume,
  activeSpeakerIds,
  avatarByUserId,
  lobbyMembers,
  onToggleMic,
  onToggleHeadphone,
  onToggleScreen,
  onToggleCamera,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  isLeavingLobby,
  activeLobbyId,
  callState,
  ongoingCall,
  onAcceptCall,
  onRejectCall,
  onEndActiveCall,
  onRejoinCall,
  // Defaults keep the call view working when the shell has no session yet.
  isWatchingScreen = () => false,
  onWatchScreen = () => undefined,
  onStopWatchingScreen = () => undefined,
}: UsersDirectMessagesPanelProps) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<InputRef>(null);
  const [isUserPopupOpen, setIsUserPopupOpen] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // A direct message has exactly one person to name. The picker still earns its
  // place here: it completes the username, which is what the notification and
  // the highlight match on — "@Ayşe" typed by hand matches no account.
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      selectedUser
        ? [
            {
              userId: selectedUser.userId,
              username: selectedUser.username,
              displayName: selectedUser.displayName,
              avatarUrl: selectedUser.avatarUrl,
            },
          ]
        : [],
    [selectedUser],
  );

  const mentionPicker = useMentionPicker({
    draft: messageDraft,
    onDraftChange: onMessageDraftChange,
    candidates: mentionCandidates,
    inputRef: composerInputRef,
  });

  // Mute toggle list management
  useEffect(() => {
    if (!selectedUser) return;
    try {
      const mutedUsersStr = localStorage.getItem("connect_muted_call_users") || "[]";
      const mutedIds = JSON.parse(mutedUsersStr);
      setIsMuted(Array.isArray(mutedIds) && mutedIds.includes(selectedUser.userId));
    } catch {
      setIsMuted(false);
    }
  }, [selectedUser]);

  const handleToggleMuteCalls = () => {
    if (!selectedUser) return;
    try {
      const mutedUsersStr = localStorage.getItem("connect_muted_call_users") || "[]";
      let mutedIds = JSON.parse(mutedUsersStr);
      if (!Array.isArray(mutedIds)) mutedIds = [];
      
      if (mutedIds.includes(selectedUser.userId)) {
        mutedIds = mutedIds.filter((id: string) => id !== selectedUser.userId);
        setIsMuted(false);
      } else {
        mutedIds.push(selectedUser.userId);
        setIsMuted(true);
      }
      localStorage.setItem("connect_muted_call_users", JSON.stringify(mutedIds));
    } catch (e) {
      console.error("Mute toggle error:", e);
    }
  };

  // ----- PARTICIPANT & LAYOUT COMPUTATIONS (When call is active) -----
  const { lobbyParticipants } = useLobbyParticipants({
    lobbyMembers: lobbyMembers || [],
    currentUserId,
    currentUsername: "",
    activeLobbyId: activeLobbyId || null,
    // Shared constants, not fresh literals: these are effect and memo inputs
    // downstream, and `|| []` on an absent prop hands them a new identity on every
    // render of this panel.
    activeSpeakerIds: activeSpeakerIds ?? EMPTY_SPEAKER_IDS,
    remoteParticipantStreams: remoteParticipantStreams ?? EMPTY_MEDIA_MAP,
    micEnabled: micEnabled || false,
    headphoneEnabled: headphoneEnabled || false,
    cameraEnabled: cameraEnabled || false,
    screenEnabled: screenEnabled || false,
    localFallbackJoinedAt: new Date().toISOString(),
  });

  const { stageParticipantSlots } = useLobbyStageSlots({
    lobbyParticipants,
    activeLobbyId: activeLobbyId || null,
  });

  const enhancedStageParticipantSlots = useMemo<StageParticipantSlot[]>(() => {
    const calleeId = selectedUser?.userId;
    const isCallMode = activeLobbyId?.startsWith("call_") || callState?.status === "outgoing";
    
    if (isCallMode && calleeId) {
      const isCalleeConnected = lobbyParticipants.some((p) => p.userId === calleeId);
      if (!isCalleeConnected && selectedUser) {
        // Callee hasn't joined yet. Inject a pulsing virtual placeholder participant slot
        const calleePlaceholder: LobbyParticipantView = {
          userId: selectedUser.userId,
          username: selectedUser.displayName || selectedUser.username,
          joinedAt: new Date().toISOString(),
          muted: true,
          serverMuted: false,
          deafened: true,
          speaking: false,
          cameraEnabled: false,
          screenSharing: false,
          isLocalUser: false,
          isPlaceholder: true,
        };
        
        let localSlot = stageParticipantSlots.find((s) => s.participant.isLocalUser);
        if (!localSlot && callState?.callerId === currentUserId) {
          const localUserPlaceholder: LobbyParticipantView = {
            userId: currentUserId,
            username: "Siz",
            joinedAt: new Date().toISOString(),
            muted: !micEnabled,
            serverMuted: false,
            deafened: !headphoneEnabled,
            speaking: false,
            cameraEnabled: cameraEnabled || false,
            screenSharing: screenEnabled || false,
            isLocalUser: true,
          };
          localSlot = {
            slotId: `placeholder-local-${currentUserId}`,
            participant: localUserPlaceholder,
            sourcePreference: "auto",
            kind: "avatar",
          };
        }
        
        const placeholderSlot = {
          slotId: `placeholder-${calleeId}`,
          participant: calleePlaceholder,
          sourcePreference: "auto" as const,
          kind: "avatar" as const,
        };
        
        if (localSlot) {
          return [localSlot, placeholderSlot];
        }
        return [placeholderSlot];
      }
    }
    return stageParticipantSlots;
    // callState.status is what decides whether a placeholder tile belongs here;
    // callerId only names who is ringing and changes on the same transition, so
    // listing it would rebuild the stage a second time for one event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageParticipantSlots, lobbyParticipants, selectedUser, activeLobbyId, callState?.status, currentUserId, micEnabled, headphoneEnabled, cameraEnabled, screenEnabled]);

  // Persisted, for the same reason as the lobby's: this panel is unmounted on
  // every workspace section change, so a closed thread came back open.
  const isChatOpen = useUiStore((state) => state.viewPreferences.callChatOpen);
  const isRailVisible = useUiStore(
    (state) => state.viewPreferences.participantRailVisible,
  );
  const setViewPreference = useUiStore((state) => state.setViewPreference);
  const setIsRailVisible = useCallback(
    (visible: boolean) => setViewPreference("participantRailVisible", visible),
    [setViewPreference],
  );
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [contextMenuParticipantId, setContextMenuParticipantId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const effectiveParticipantCount = useMemo(() => {
    if (focusedParticipantId && !isRailVisible) {
      return 1;
    }
    return enhancedStageParticipantSlots.length;
  }, [focusedParticipantId, isRailVisible, enhancedStageParticipantSlots.length]);

  const { stagePanelRef, stageLayoutStyle } = useLobbyStageLayout(
    effectiveParticipantCount,
    isChatOpen,
  );

  // The thread and the rail are deliberately not reset here; they are layout
  // choices, not state belonging to the call that just ended.
  useEffect(() => {
    setFocusedParticipantId(null);
    setContextMenuParticipantId(null);
    setContextMenuPosition(null);
  }, [activeLobbyId]);

  useEffect(() => {
    if (!focusedParticipantId && !contextMenuParticipantId) return;
    if (focusedParticipantId) {
      const exists = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === focusedParticipantId);
      if (!exists) setFocusedParticipantId(null);
    }
    if (contextMenuParticipantId) {
      const exists = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === contextMenuParticipantId);
      if (!exists) setContextMenuParticipantId(null);
    }
  }, [contextMenuParticipantId, focusedParticipantId, lobbyParticipants]);

  const handleParticipantFocus = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView) => {
    if (participant.isLocalUser) return;
    event.stopPropagation();
    setContextMenuParticipantId(null);
    setContextMenuPosition(null);
    setFocusedParticipantId((prev) => (prev === participant.userId ? null : participant.userId));
  };

  // Same as the lobby stage: subscribing to a share without giving it the stage
  // leaves adaptive streaming sizing the delivered layer to a small grid tile.
  const handleWatchScreen = (userId: string): void => {
    onWatchScreen(userId);
    setFocusedParticipantId(userId);
  };

  const handleParticipantContextMenu = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView) => {
    if (participant.isLocalUser) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenuParticipantId(participant.userId);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const selectedPreference = contextMenuParticipantId && remoteParticipantAudioPreferences
    ? (remoteParticipantAudioPreferences[contextMenuParticipantId] ?? { muted: false, volumePercent: 100 })
    : { muted: false, volumePercent: 100 };

  // Names for the audience badge on a shared screen. A call has no roster, so
  // the two people on the stage are the whole directory it needs.
  const nameByUserId = useMemo(() => {
    const names: Record<string, string> = {};
    for (const slot of enhancedStageParticipantSlots) {
      names[slot.participant.userId] = slot.participant.username;
    }
    return names;
  }, [enhancedStageParticipantSlots]);

  const focusedParticipantSlot = useMemo(
    () => (focusedParticipantId ? (enhancedStageParticipantSlots.find((slot) => slot.participant.userId === focusedParticipantId) ?? null) : null),
    [focusedParticipantId, enhancedStageParticipantSlots],
  );

  const nonFocusedParticipantSlots = useMemo(
    () => (focusedParticipantId ? enhancedStageParticipantSlots.filter((slot) => slot.participant.userId !== focusedParticipantId) : enhancedStageParticipantSlots),
    [focusedParticipantId, enhancedStageParticipantSlots],
  );

  // These used to route through `window.__liveKitSession`, which nothing in the
  // codebase ever assigned — the value was always undefined, so every guard
  // short-circuited and right-clicking a peer tile during a call moved the UI
  // but changed nothing. WorkspaceShell already builds working handlers via
  // useRemoteParticipantAudio; WorkspaceMainPanel just never forwarded them
  // here.
  const handleMute = (muted: boolean) => {
    if (contextMenuParticipantId) {
      onSetRemoteParticipantMuted?.(contextMenuParticipantId, muted);
    }
  };

  const handleVolume = (volumePercent: number) => {
    if (contextMenuParticipantId) {
      onSetRemoteParticipantVolume?.(contextMenuParticipantId, volumePercent);
    }
  };

  const handleToggleCameraHidden = (hidden: boolean) => {
    if (contextMenuParticipantId) {
      onSetRemoteParticipantCameraHidden?.(contextMenuParticipantId, hidden);
    }
  };

  const handleScreenAudioMute = (muted: boolean) => {
    if (contextMenuParticipantId) {
      onSetRemoteParticipantScreenAudioMuted?.(contextMenuParticipantId, muted);
    }
  };

  const handleScreenAudioVolume = (volumePercent: number) => {
    if (contextMenuParticipantId) {
      onSetRemoteParticipantScreenAudioVolume?.(contextMenuParticipantId, volumePercent);
    }
  };

  // Nothing is played locally: the sound comes back over the lobby stream, the
  // same frame the peer gets, so hearing it is the confirmation it went out.
  const handleSendEmote = (emote: string): void => {
    if (!activeLobbyId) return;
    void workspaceService.sendLobbyEmote({ lobbyId: activeLobbyId, emote });
  };

  const showEmptyState =
    !directMessagesQuery.isPending &&
    !directMessagesQuery.isError &&
    Boolean(directMessagesQuery.data?.ok) &&
    directMessages.length === 0;

  const { handleChatScroll } = useThreadScroll({
    containerRef: chatScrollRef,
    peerUserId: selectedUser?.userId ?? null,
    messageCount: directMessages.length,
    hasMoreMessages,
    isLoadingOlderMessages,
    onLoadOlderMessages,
  });

  const renderChatBox = () => {
    return (
      <div className="ct-chat-thread-box">
        {onRunSearch && (
          <div className="ct-chat-search">
            <Input
              allowClear
              size="small"
              value={searchQuery}
              placeholder="Bu sohbette ara…"
              prefix={<SearchOutlined />}
              onChange={(event) => {
                const value = event.target.value;
                if (!value.trim()) {
                  onClearSearch?.();
                  return;
                }
                onRunSearch(value);
              }}
            />
          </div>
        )}
        <div
          className={`ct-chat-messages ${showEmptyState ? "empty" : ""}`}
          ref={chatScrollRef}
          onScroll={handleChatScroll}
        >
          {directMessagesQuery.isPending && (
            <div className="ct-list-state">Mesajlar yükleniyor...</div>
          )}

          {!directMessagesQuery.isPending &&
            directMessagesQuery.isError && (
              <div className="ct-list-state error">
                Mesajlar alınamadı: {directMessagesQuery.error.message}
              </div>
            )}

          {!directMessagesQuery.isPending &&
            !directMessagesQuery.isError &&
            !directMessagesQuery.data?.ok && (
              <div className="ct-list-state error">
                Mesajlar alınamadı:{" "}
                {getApiErrorMessage(directMessagesQuery.data?.error)}
              </div>
            )}

          {searchResults === null && showEmptyState && (
            <div className="ct-list-state ct-chat-empty-state">
              <p>Bu kişiyle henüz mesajlaşma yok.</p>
              <span>
                İlk mesajı göndermek için aşağıdaki yazma alanını kullanabilirsin.
              </span>
            </div>
          )}

          {searchResults !== null && (
            <div className="ct-chat-message-list">
              <div className="ct-chat-search-summary">
                {isSearching
                  ? "Aranıyor…"
                  : `"${searchQuery}" için ${searchResults.length} sonuç`}
              </div>
              {searchResults.map((message: ChatMessage) => (
                <DirectChatMessageRow
                  key={`search-${message.id}`}
                  message={message}
                  isOwnMessage={message.userId === currentUserId}
                  isDeleting={false}
                  deleteDisabled
                  peerLabel={
                    selectedUser?.displayName || selectedUser?.username || ""
                  }
                  currentUsername={currentUsername}
                  currentUserId={currentUserId}
                  onRequestDelete={setPendingDeleteMessageId}
                  onReply={(message) => onSetReplyTo?.(message)}
                  onEdit={(messageId, body) => onEditMessage?.(messageId, body)}
                  onToggleReaction={(messageId, emoji, add) =>
                    onToggleReaction?.(messageId, emoji, add)
                  }
                />
              ))}
            </div>
          )}

          {searchResults === null && !showEmptyState && (
            <div className="ct-chat-message-list">
              {hasMoreMessages && directMessages.length > 0 && (
                <div className="ct-chat-load-older" aria-live="polite">
                  {isLoadingOlderMessages ? (
                    <>
                      <LoadingOutlined />
                      <span>Daha eski mesajlar yükleniyor…</span>
                    </>
                  ) : (
                    <span>Daha eskisi için yukarı kaydırın</span>
                  )}
                </div>
              )}

              {directMessages.map((message: ChatMessage) => (
                <DirectChatMessageRow
                  key={message.id}
                  message={message}
                  isOwnMessage={message.userId === currentUserId}
                  isDeleting={deletingMessageId === message.id}
                  deleteDisabled={Boolean(deletingMessageId)}
                  peerLabel={
                    selectedUser?.displayName || selectedUser?.username || ""
                  }
                  currentUsername={currentUsername}
                  currentUserId={currentUserId}
                  onRequestDelete={setPendingDeleteMessageId}
                  onReply={(message) => onSetReplyTo?.(message)}
                  onEdit={(messageId, body) => onEditMessage?.(messageId, body)}
                  onToggleReaction={(messageId, emoji, add) =>
                    onToggleReaction?.(messageId, emoji, add)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {isPeerTyping && (
          <div className="ct-chat-typing-indicator" aria-live="polite">
            {selectedUser?.displayName || selectedUser?.username} yazıyor…
          </div>
        )}

        <div className="ct-chat-composer ct-mention-anchor">
          <MentionPicker
            isOpen={mentionPicker.isOpen}
            matches={mentionPicker.matches}
            activeIndex={mentionPicker.activeIndex}
            onHover={mentionPicker.setActiveIndex}
            onChoose={mentionPicker.choose}
          />
          {replyTo && (
            <div className="ct-composer-chip">
              <div className="ct-composer-chip-text">
                <ChatReplyQuote
                  replyTo={{
                    id: replyTo.id,
                    username: replyTo.username,
                    body: replyTo.body.slice(0, 120),
                  }}
                />
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => onSetReplyTo?.(null)}
                aria-label="Yanıtı iptal et"
              />
            </div>
          )}

          {pendingAttachment && (
            <div className="ct-composer-chip">
              <span className="ct-composer-chip-text">
                {pendingAttachment.name} ·{" "}
                {formatAttachmentSize(pendingAttachment.size)}
              </span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => onSetPendingAttachment?.(null)}
                aria-label="Dosyayı kaldır"
              />
            </div>
          )}

          <div className="ct-chat-composer-row">
            <ChatComposerEmojiButton
              disabled={isSendingMessage}
              // Updater, not `messageDraft + emoji`: the picker stays open, so a
              // burst of picks shares one render and every closure would read
              // the same stale draft — each emoji overwriting the previous one.
              onPick={(emoji) =>
                onMessageDraftChange((previous) => previous + emoji)
              }
            />
            {/* The GIF goes out as its own message. It used to be written into
                the draft and sent a render later, which silently destroyed
                whatever the user had typed: "şuna bak" + pick a GIF = "şuna
                bak" gone, with no undo. */}
            <ChatGifButton
              disabled={isSendingMessage}
              onPick={(url) => onSendMessage(url)}
            />
            <ChatAttachButton
              disabled={isSendingMessage}
              onSelect={(upload, file) =>
                onSetPendingAttachment?.({
                  upload,
                  name: file.name,
                  size: file.size,
                })
              }
            />
            <Input
              ref={composerInputRef}
              placeholder={
                pendingAttachment ? "Açıklama (isteğe bağlı)…" : "Mesaj yaz..."
              }
              value={messageDraft}
              onChange={(event) => {
                onMessageDraftChange(event.target.value);
                mentionPicker.syncCaret();
                if (event.target.value.trim()) {
                  onTyping?.();
                }
              }}
              // Clicking or arrowing into the middle of an @token has to open
              // the picker too, not just typing at the end.
              onSelect={mentionPicker.syncCaret}
              onBlur={mentionPicker.close}
              onKeyDown={(event) => {
                // Consumes Enter/Tab/arrows while the list is open, so picking
                // a name does not also send the message.
                mentionPicker.handleKeyDown(event);
              }}
              onPressEnter={(event) => {
                if (mentionPicker.isOpen) {
                  return;
                }
                if (
                  !event.shiftKey &&
                  (messageDraft.trim() || pendingAttachment)
                ) {
                  event.preventDefault();
                  onSendMessage();
                }
              }}
              disabled={isSendingMessage}
              className="ct-chat-input"
              suffix={
                <Button
                  type="text"
                  size="small"
                  className="ct-chat-send-btn"
                  icon={<SendOutlined />}
                  // Wrapped, not passed directly: onClick hands the handler a
                  // MouseEvent, which would arrive as the body override and be
                  // sent as the message.
                  onClick={() => onSendMessage()}
                  loading={isSendingMessage}
                  disabled={
                    isSendingMessage ||
                    (!messageDraft.trim() && !pendingAttachment)
                  }
                  aria-label="Gönder"
                />
              }
            />
          </div>
        </div>
      </div>
    );
  };

  const isCallActive = (callState?.status === "active" || (callState?.status === "outgoing" && callState.callerId === currentUserId)) && callState.peerUser?.userId === selectedUser?.userId;

  return (
    <article
      className={`ct-chat-panel ct-chat-panel-plain ${isCallActive ? "in-call" : ""}`}
    >
      {selectedUser ? (
        <>
          {isCallActive ? (
            <div className="ct-call-split">
              {/* LEFT SIDE: EMBEDDED CALL STAGE */}
              <section
                className="ct-lobby-stage-panel ct-call-stage"
                ref={stagePanelRef}
              >
                {/* Embedded Stage Toggle Chat Button */}
                <button
                  type="button"
                  className="ct-lobby-chat-toggle in-stage"
                  onClick={() => setViewPreference("callChatOpen", !isChatOpen)}
                >
                  {isChatOpen ? (
                    <>
                      <RightOutlined /> Sohbeti Kapat
                    </>
                  ) : (
                    <>
                      <LeftOutlined /> Sohbeti Aç
                    </>
                  )}
                </button>

                {/* LobbyStageView */}
                <LobbyStageView
                  stageParticipantSlots={enhancedStageParticipantSlots}
                  nameByUserId={nameByUserId}
                  focusedParticipantSlot={focusedParticipantSlot}
                  nonFocusedParticipantSlots={nonFocusedParticipantSlots}
                  avatarByUserId={avatarByUserId || {}}
                  localCameraStream={localCameraStream || null}
                  localScreenStream={localScreenStream || null}
                  remoteParticipantStreams={remoteParticipantStreams || {}}
                  remoteParticipantAudioPreferences={remoteParticipantAudioPreferences || {}}
                  focusedParticipantId={focusedParticipantId}
                  stageLayoutStyle={stageLayoutStyle}
                  handleParticipantFocus={handleParticipantFocus}
                  handleParticipantContextMenu={handleParticipantContextMenu}
                  audioInputDevices={audioInputDevices || []}
                  audioOutputDevices={audioOutputDevices || []}
                  selectedAudioInputDeviceId={selectedAudioInputDeviceId || null}
                  selectedAudioOutputDeviceId={selectedAudioOutputDeviceId || null}
                  onSelectAudioInputDevice={onSelectAudioInputDevice || (() => {})}
                  onSelectAudioOutputDevice={onSelectAudioOutputDevice || (() => {})}
                  isRailVisible={isRailVisible}
                  setIsRailVisible={setIsRailVisible}
                  isWatchingScreen={isWatchingScreen}
                  onWatchScreen={handleWatchScreen}
                />

                {/* LobbyActionToolbar */}
                <LobbyActionToolbar
                  micEnabled={micEnabled || false}
                  headphoneEnabled={headphoneEnabled || false}
                  screenEnabled={screenEnabled || false}
                  cameraEnabled={cameraEnabled || false}
                  isLeavingLobby={isLeavingLobby || false}
                  onToggleMic={onToggleMic || (() => {})}
                  onToggleHeadphone={onToggleHeadphone || (() => {})}
                  onToggleScreen={onToggleScreen || (() => {})}
                  onToggleCamera={onToggleCamera || (() => {})}
                  onLeaveLobby={onEndActiveCall || (() => {})}
                  audioInputDevices={audioInputDevices || []}
                  audioOutputDevices={audioOutputDevices || []}
                  selectedAudioInputDeviceId={selectedAudioInputDeviceId || null}
                  selectedAudioOutputDeviceId={selectedAudioOutputDeviceId || null}
                  onSelectAudioInputDevice={onSelectAudioInputDevice || (() => {})}
                  onSelectAudioOutputDevice={onSelectAudioOutputDevice || (() => {})}
                  // A call runs in a room named call_<id> through the same
                  // manager as a lobby, so the same membership check and the
                  // same broadcast apply here without a second path.
                  onSendEmote={handleSendEmote}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              </section>

              {/* RIGHT SIDE: SLIDABLE CHAT */}
              <aside
                className={`ct-call-chat-drawer ${isChatOpen ? "" : "closed"}`}
                aria-hidden={!isChatOpen}
              >
                <div className="ct-call-chat-drawer-header">
                  <strong>
                    <MessageOutlined />
                    Sohbet
                  </strong>
                  <Button
                    type="text"
                    size="small"
                    icon={<RightOutlined />}
                    onClick={() => setViewPreference("callChatOpen", false)}
                    aria-label="Sohbeti kapat"
                  />
                </div>
                {renderChatBox()}
              </aside>

              {/* Context Menu */}
              {contextMenuParticipantId && contextMenuPosition && (
                <ParticipantContextMenu
                  key={`context-menu-${contextMenuParticipantId}`}
                  x={contextMenuPosition.x}
                  y={contextMenuPosition.y}
                  preference={selectedPreference}
                  isScreenSharing={
                    lobbyMembers?.find((m) => m.userId === contextMenuParticipantId)?.screenSharing ?? false
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
                />
              )}
            </div>
          ) : (
            // STANDARD DIRECT MESSAGES CHAT SCREEN WITH UPPER REJOIN BANNER
            <>
              <div className="ct-chat-user-header-premium" onClick={() => setIsUserPopupOpen(true)}>
                <div className="ct-chat-user-header-left">
                  <div className="relative">
                    <Avatar
                      size={42}
                      src={selectedUser.avatarUrl}
                      icon={!selectedUser.avatarUrl && <UserOutlined />}
                      className="ct-chat-user-header-avatar"
                    />
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border border-ct-surface-1 ${
                        selectedUser.appOnline ? "bg-emerald-500" : "bg-zinc-500"
                      }`}
                    />
                  </div>

                  <div className="ct-chat-user-header-main">
                    <h3>{selectedUser.displayName || selectedUser.username}</h3>
                    {/* A conversation seeded from history — or opened by a call
                        — knows a non-friend's display name and nothing else, so
                        a bare "@" is all this would render. */}
                    {selectedUser.username && <span>@{selectedUser.username}</span>}
                  </div>
                </div>

                <div className="ct-chat-user-header-actions">
                  <span className="ct-status-chip">
                    {getUserStatusLabel(selectedUser.appOnline)}
                  </span>
                  
                  {/* Call Mute Toggle Button */}
                  <Tooltip title={isMuted ? "Aramaları Sesi Aç" : "Aramaları Sessize Al"}>
                    <Button
                      type="text"
                      icon={
                        isMuted ? (
                          <BellFilled className="ct-icon-danger" />
                        ) : (
                          <BellOutlined />
                        )
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMuteCalls();
                      }}
                    />
                  </Tooltip>

                  {onInitiateCall && (
                    <Tooltip title="Ara">
                      <Button
                        type="text"
                        icon={<PhoneOutlined className="ct-icon-success" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInitiateCall(selectedUser);
                        }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Kullanıcı Bilgisi">
                    <Button
                      type="text"
                      icon={<InfoCircleOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsUserPopupOpen(true);
                      }}
                    />
                  </Tooltip>
                </div>
              </div>

              {/* In-chat incoming call alert banner */}
              {callState?.status === "incoming" && callState.callerId === selectedUser?.userId && (
                <div className="ct-muted-call-banner">
                  {/* Left side: Avatar and Text */}
                  <div className="ct-banner-text-content">
                    <div className="ct-call-pulse-avatar-container" >
                      <Avatar
                        size={32}
                        src={selectedUser.avatarUrl}
                        icon={!selectedUser.avatarUrl && <UserOutlined />}
                        
                      />
                    </div>
                    <div className="ct-banner-lines">
                      <span >
                        {selectedUser.displayName || selectedUser.username} arıyor...
                      </span>
                      <span >
                        Gelen sesli/görüntülü arama
                      </span>
                    </div>
                  </div>
                  {/* Right side: Buttons */}
                  <div className="ct-banner-actions">
                    {/* Plain buttons: an antd Button here brought nothing but a
                        cssinjs sheet this stylesheet then had to out-shout with
                        !important on every property. See .ct-banner-accept-btn. */}
                    <button
                      type="button"
                      onClick={onAcceptCall}
                      className="ct-banner-accept-btn"
                    >
                      <PhoneOutlined />
                      Kabul Et
                    </button>
                    <button
                      type="button"
                      onClick={onRejectCall}
                      className="ct-banner-reject-btn"
                    >
                      <CloseOutlined />
                      Reddet
                    </button>
                  </div>
                </div>
              )}

              {/* Rejoin Background Active Call Banner */}
              {ongoingCall && ongoingCall.peerUser.userId === selectedUser?.userId && callState?.status !== "active" && (
                <div className="ct-rejoin-banner">
                  <div className="ct-banner-text-content">
                    <PhoneOutlined className="ct-icon-success" />
                    <span >Devam eden aktif bir sesli/görüntülü arama var.</span>
                  </div>
                  <button
                    type="button"
                    onClick={onRejoinCall}
                    className="ct-banner-rejoin-btn"
                  >
                    Katıl
                  </button>
                </div>
              )}

              {renderChatBox()}
            </>
          )}

          <Drawer
            title={
              <div className="flex items-center gap-2 text-white">
                <UserOutlined />
                <span className="font-bold text-[14px] tracking-wide uppercase">Kullanıcı Profili</span>
              </div>
            }
            rootClassName="ct-user-drawer"
            placement="right"
            onClose={() => setIsUserPopupOpen(false)}
            open={isUserPopupOpen}
            width={340}
            styles={{
              mask: {
                backdropFilter: "blur(6px)",
                background: "rgba(0, 0, 0, 0.6)",
              },
              content: {
                background: "rgba(10, 10, 10, 0.98)",
                borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
                color: "var(--ct-text-primary)",
              },
              header: {
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(10, 10, 10, 0.98)",
                padding: "16px 24px",
              },
              body: {
                padding: "24px",
              }
            }}
          >
            <div className="flex flex-col items-center text-center gap-4 pb-6">
              <div className="relative">
                <Avatar
                  size={96}
                  src={selectedUser.avatarUrl}
                  icon={!selectedUser.avatarUrl && <UserOutlined />}
                  className="ct-chat-user-header-avatar"
                />
                <span
                  className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-ct-surface-1 ${
                    selectedUser.appOnline ? "bg-emerald-500" : "bg-zinc-500"
                  }`}
                />
              </div>

              <div>
                <h3 className="text-[17px] font-bold text-white leading-snug">
                  {selectedUser.displayName || selectedUser.username}
                </h3>
                {selectedUser.username && (
                  <p className="text-[13px] text-ct-text-muted mt-0.5">@{selectedUser.username}</p>
                )}
              </div>

              <Tag color={selectedUser.role === "admin" ? "gold" : "default"}>
                {selectedUser.role === "admin" ? "Yönetici" : "Üye"}
              </Tag>
            </div>

            <Divider />

            <Descriptions title={null} column={1} layout="horizontal" size="small">
              <Descriptions.Item
                label={
                  <span className="text-ct-text-muted text-[12px] flex items-center gap-2">
                    <SafetyOutlined /> Rol
                  </span>
                }
              >
                <span className="text-white text-[12px] font-medium">
                  {selectedUser.role === "admin" ? "Yönetici" : "Üye"}
                </span>
              </Descriptions.Item>

              <Descriptions.Item
                label={
                  <span className="text-ct-text-muted text-[12px] flex items-center gap-2">
                    <CalendarOutlined /> Katılım Tarihi
                  </span>
                }
              >
                <span className="text-white text-[12px] font-medium">
                  {formatDateLabel(selectedUser.createdAt)}
                </span>
              </Descriptions.Item>

              <Descriptions.Item
                label={
                  <span className="text-ct-text-muted text-[12px] flex items-center gap-2">
                    <GlobalOutlined /> Durum
                  </span>
                }
              >
                <span className="text-white text-[12px] font-medium">
                  {getUserStatusLabel(
                    selectedUser.appOnline,
                    selectedUser.presence,
                  )}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div className="mt-8">
              <Button
                type="default"
                icon={<CopyOutlined />}
                block
                // Nothing to copy when the handle is unknown, and a silent
                // empty clipboard reads as the copy having worked.
                disabled={!selectedUser.username}
                onClick={() => {
                  void onCopyUsername(selectedUser.username);
                  setIsUserPopupOpen(false);
                }}
              >
                Kullanıcı Adını Kopyala
              </Button>

              {onToggleBlocked && (
                <Button
                  type="default"
                  danger={!isSelectedUserBlocked}
                  block
                  loading={isBlockUpdating}
                  onClick={() => {
                    void onToggleBlocked(selectedUser.userId);
                  }}
                  className="mt-2.5"
                >
                  {isSelectedUserBlocked
                    ? "Engeli Kaldır"
                    : "Kullanıcıyı Engelle"}
                </Button>
              )}

              {isSelectedUserBlocked && (
                <p className="ct-field-hint mt-2 text-center">
                  Engellenen kullanıcıyla mesajlaşma ve arama karşılıklı olarak
                  kapalıdır.
                </p>
              )}
            </div>
          </Drawer>

          <ConfirmActionModal
            isOpen={pendingDeleteMessageId !== null}
            title="Mesajı Sil"
            message="Bu direkt mesaj kalıcı olarak silinecek. Devam etmek istiyor musun?"
            confirmLabel="Mesajı Sil"
            isProcessing={
              pendingDeleteMessageId !== null &&
              deletingMessageId === pendingDeleteMessageId
            }
            onCancel={() => setPendingDeleteMessageId(null)}
            onConfirm={() => {
              if (!pendingDeleteMessageId) {
                return;
              }

              onDeleteMessage(pendingDeleteMessageId);
              setPendingDeleteMessageId(null);
            }}
          />
        </>
      ) : (
        friendsHome && (
          <FriendsHomePanel {...friendsHome} currentUserId={currentUserId} />
        )
      )}
    </article>
  );
}
