import {
  memo,
  useEffect,
  useRef,
  useState,
  useMemo,
  type MouseEvent,
} from "react";
import { Drawer, Input, Button, Tag, Divider, Descriptions, Avatar, Tooltip } from "antd";
import {
  SendOutlined,
  CopyOutlined,
  DeleteOutlined,
  CalendarOutlined,
  SafetyOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  BellOutlined,
  BellFilled,
  LeftOutlined,
  RightOutlined,
  MessageOutlined,
  CloseOutlined,
  EditOutlined,
  EnterOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { UserDirectoryEntry, ChatMessage } from "@shared/auth-contracts";
import type { UseDirectMessagesResult } from "../../hooks/chat/use-direct-messages";
import {
  formatDateLabel,
  formatTimeLabel,
  getApiErrorMessage,
  getUserStatusLabel,
} from "../../workspace-utils";
import { ConfirmActionModal } from "../common";
import {
  ChatAttachButton,
  ChatAttachmentView,
  ChatQuickReactionPicker,
  ChatReactionBar,
  ChatReplyQuote,
  formatAttachmentSize,
} from "../common/chat-message-parts";

interface DirectChatMessageRowProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isDeleting: boolean;
  deleteDisabled: boolean;
  peerLabel: string;
  currentUsername: string;
  currentUserId: string;
  onRequestDelete: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, body: string) => void;
  onToggleReaction: (messageId: string, emoji: string, add: boolean) => void;
}

// Turkish usernames can contain letters outside \w, so the class is explicit
// rather than \w+.
const MENTION_PATTERN = /(@[A-Za-z0-9_çğıöşüÇĞİÖŞÜ.-]{2,64})/g;

// Renders @name runs as highlighted spans, and marks the ones aimed at you.
// A mention used to be indistinguishable from any other word in the message.
const renderWithMentions = (
  body: string,
  currentUsername: string,
): React.ReactNode[] => {
  const normalizedSelf = `@${currentUsername.toLocaleLowerCase("tr-TR")}`;

  return body.split(MENTION_PATTERN).map((part, index) => {
    if (!part.startsWith("@")) {
      return part;
    }

    const isSelf = part.toLocaleLowerCase("tr-TR") === normalizedSelf;
    return (
      <span
        key={`${index}-${part}`}
        className={`ct-chat-mention ${isSelf ? "self" : ""}`}
        style={{
          borderRadius: "4px",
          padding: "0 3px",
          fontWeight: 600,
          color: isSelf ? "#0b0b0b" : "#93c5fd",
          background: isSelf ? "#fbbf24" : "rgba(147, 197, 253, 0.12)",
        }}
      >
        {part}
      </span>
    );
  });
};

// mentionsUser answers "was I named in this message", used to decide whether a
// lobby/DM message deserves a notification even when it is not addressed to a
// conversation the user is looking at.
export const mentionsUser = (body: string, username: string): boolean => {
  if (!username) {
    return false;
  }
  const needle = `@${username.toLocaleLowerCase("tr-TR")}`;
  const matches: string[] =
    body.toLocaleLowerCase("tr-TR").match(MENTION_PATTERN) ?? [];
  return matches.includes(needle);
};

// One rendered message, memoized on primitives. The composer draft and the
// call/typing state all live in this panel, so without this every keystroke
// re-rendered the whole conversation backlog.
const DirectChatMessageRow = memo(function DirectChatMessageRow({
  message,
  isOwnMessage,
  isDeleting,
  deleteDisabled,
  peerLabel,
  currentUsername,
  currentUserId,
  onRequestDelete,
  onReply,
  onEdit,
  onToggleReaction,
}: DirectChatMessageRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.body);
  const isCallStart = message.body === "📞 Arama başladı";
  const isCallEnd = message.body === "📞 Arama bitti";

  if (isCallStart || isCallEnd) {
    return (
      <div
        className="ct-chat-row-system"
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "12px 0",
          width: "100%",
        }}
      >
        <div
          className="ct-chat-system-call-pill"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "20px",
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: "500",
              color: isCallStart ? "#22c55e" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <PhoneOutlined style={{ fontSize: "12px" }} />
            {message.body}
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.35)",
              fontWeight: "500",
            }}
          >
            • {formatTimeLabel(message.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  const commitEdit = (): void => {
    const trimmed = editDraft.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== message.body) {
      onEdit(message.id, trimmed);
    }
  };

  return (
    <div className={`ct-chat-row ${isOwnMessage ? "own" : ""}`}>
      <div className={`ct-chat-bubble ${isOwnMessage ? "own" : ""}`}>
        {message.replyTo && <ChatReplyQuote replyTo={message.replyTo} />}

        {isEditing ? (
          <Input.TextArea
            autoFocus
            value={editDraft}
            autoSize={{ minRows: 1, maxRows: 6 }}
            onChange={(event) => setEditDraft(event.target.value)}
            onBlur={commitEdit}
            onPressEnter={(event) => {
              if (event.shiftKey) {
                return;
              }
              event.preventDefault();
              commitEdit();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditDraft(message.body);
                setIsEditing(false);
              }
            }}
            style={{ fontSize: 13 }}
          />
        ) : (
          message.body && (
            <p>{renderWithMentions(message.body, currentUsername)}</p>
          )
        )}

        {message.attachment && (
          <ChatAttachmentView attachment={message.attachment} />
        )}

        <ChatReactionBar
          reactions={message.reactions ?? []}
          currentUserId={currentUserId}
          onToggle={(emoji, add) => onToggleReaction(message.id, emoji, add)}
        />

        <div className="ct-chat-bubble-meta">
          <span>
            {isOwnMessage ? "Sen" : peerLabel} •{" "}
            {formatTimeLabel(message.createdAt)}
            {message.editedAt ? " • düzenlendi" : ""}
          </span>

          <span
            className="ct-chat-message-actions"
            style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
          >
            <ChatQuickReactionPicker
              onPick={(emoji) => {
                const existing = (message.reactions ?? []).find(
                  (reaction) => reaction.emoji === emoji,
                );
                // Picking an emoji you already used removes it, so the picker
                // doubles as a toggle rather than being a one-way action.
                const mine = existing?.userIds.includes(currentUserId) ?? false;
                onToggleReaction(message.id, emoji, !mine);
              }}
            />

            <button
              type="button"
              className="ct-chat-message-delete"
              onClick={() => onReply(message)}
              aria-label="Yanıtla"
              title="Yanıtla"
            >
              <EnterOutlined style={{ fontSize: "11px" }} />
            </button>

            {isOwnMessage && message.body && (
              <button
                type="button"
                className="ct-chat-message-delete"
                onClick={() => {
                  setEditDraft(message.body);
                  setIsEditing(true);
                }}
                aria-label="Mesajı düzenle"
                title="Mesajı düzenle"
              >
                <EditOutlined style={{ fontSize: "11px" }} />
              </button>
            )}

            {isOwnMessage && (
              <button
                type="button"
                className="ct-chat-message-delete"
                onClick={() => onRequestDelete(message.id)}
                disabled={deleteDisabled}
                aria-label="Mesajı sil"
                title={isDeleting ? "Mesaj siliniyor" : "Mesajı sil"}
              >
                {isDeleting ? (
                  <div className="ct-spinner-small" />
                ) : (
                  <DeleteOutlined style={{ fontSize: "11px" }} />
                )}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
});

// Calling and Stage Imports
import { useLobbyParticipants } from "../lobby/hooks/use-lobby-participants";
import { useLobbyStageSlots } from "../lobby/hooks/use-lobby-stage-slots";
import { LobbyStageView } from "../lobby/parts/LobbyStageView";
import { LobbyActionToolbar } from "../lobby/parts/LobbyActionToolbar";
import { ParticipantContextMenu } from "../lobby/parts/ParticipantContextMenu";
import { useLobbyStageLayout } from "../lobby/lobby-stage-layout";
import { type LobbyParticipantView } from "../lobby/lobby-participant-tile";
import { type StageParticipantSlot } from "../lobby/lobby-view-utils";
import type { ParticipantMediaMap, RemoteParticipantAudioPreference } from "@/features/livekit";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import type { CallSessionState } from "../../hooks";
import type { OngoingCallInfo } from "../../hooks/user/use-call-session";
import workspaceService from "../../services";

interface UsersDirectMessagesPanelProps {
  currentUserId: string;
  selectedUser: UserDirectoryEntry | null;
  onCopyUsername: (username: string) => Promise<void>;
  directMessagesQuery: UseDirectMessagesResult["directMessagesQuery"];
  directMessages: UseDirectMessagesResult["directMessages"];
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
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
  onSendMessage: () => void;
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
  selectedUser,
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
  const [isUserPopupOpen, setIsUserPopupOpen] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Mute toggle list management
  useEffect(() => {
    if (!selectedUser) return;
    try {
      const mutedUsersStr = localStorage.getItem("connect_muted_call_users") || "[]";
      const mutedIds = JSON.parse(mutedUsersStr);
      setIsMuted(Array.isArray(mutedIds) && mutedIds.includes(selectedUser.userId));
    } catch (e) {
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
    activeSpeakerIds: activeSpeakerIds || [],
    remoteParticipantStreams: remoteParticipantStreams || {},
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
  }, [stageParticipantSlots, lobbyParticipants, selectedUser, activeLobbyId, callState?.status, currentUserId, micEnabled, headphoneEnabled, cameraEnabled, screenEnabled]);

  const [isChatOpen, setIsChatOpen] = useState(true);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [isRailVisible, setIsRailVisible] = useState(true);
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

  useEffect(() => {
    setIsRailVisible(true);
  }, [focusedParticipantId]);

  useEffect(() => {
    setIsChatOpen(true);
    setFocusedParticipantId(null);
    setContextMenuParticipantId(null);
    setContextMenuPosition(null);
    setIsRailVisible(true);
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

  const showEmptyState =
    !directMessagesQuery.isPending &&
    !directMessagesQuery.isError &&
    Boolean(directMessagesQuery.data?.ok) &&
    directMessages.length === 0;

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [directMessages.length, selectedUser]);

  const renderChatBox = () => {
    return (
      <div className="ct-chat-thread-box" style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {onRunSearch && (
          <div style={{ padding: "8px 16px 0" }}>
            <Input
              allowClear
              size="small"
              value={searchQuery}
              placeholder="Bu sohbette ara…"
              prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
              onChange={(event) => {
                const value = event.target.value;
                if (!value.trim()) {
                  onClearSearch?.();
                  return;
                }
                onRunSearch(value);
              }}
              style={{
                background: "rgba(12, 12, 12, 0.6)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
              }}
            />
          </div>
        )}
        <div
          className={`ct-chat-messages ${showEmptyState ? "empty" : ""}`}
          ref={chatScrollRef}
          style={{ flex: 1, overflowY: "auto" }}
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
              <p className="text-sm text-[#8f8f8f] mb-1">Bu kişiyle henüz mesajlaşma yok.</p>
              <p className="text-xs text-[#5f5f5f]">İlk mesajı göndermek için aşağıdaki yazma alanını kullanabilirsin.</p>
            </div>
          )}

          {searchResults !== null && (
            <div className="ct-chat-message-list">
              <div
                style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
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
                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                  <Button
                    size="small"
                    type="text"
                    loading={isLoadingOlderMessages}
                    onClick={onLoadOlderMessages}
                    style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}
                  >
                    Daha eski mesajları yükle
                  </Button>
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
          <div
            className="ct-chat-typing-indicator"
            aria-live="polite"
            style={{
              padding: "0 16px 6px",
              fontSize: "11px",
              color: "rgba(255,255,255,0.45)",
              fontStyle: "italic",
            }}
          >
            {selectedUser?.displayName || selectedUser?.username} yazıyor…
          </div>
        )}

        <div className="ct-chat-composer" style={{ padding: "16px", background: "transparent" }}>
          {replyTo && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
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

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
              size="large"
              placeholder={
                pendingAttachment ? "Açıklama (isteğe bağlı)…" : "Mesaj yaz..."
              }
              value={messageDraft}
              onChange={(event) => {
                onMessageDraftChange(event.target.value);
                if (event.target.value.trim()) {
                  onTyping?.();
                }
              }}
              onPressEnter={(event) => {
                if (
                  !event.shiftKey &&
                  (messageDraft.trim() || pendingAttachment)
                ) {
                  event.preventDefault();
                  onSendMessage();
                }
              }}
              disabled={isSendingMessage}
              suffix={
                <Button
                  type="text"
                  icon={<SendOutlined style={{ color: messageDraft.trim() || pendingAttachment ? "#ffffff" : "rgba(255,255,255,0.2)" }} />}
                  onClick={onSendMessage}
                  loading={isSendingMessage}
                  disabled={
                    isSendingMessage ||
                    (!messageDraft.trim() && !pendingAttachment)
                  }
                  style={{ background: "transparent", border: "none" }}
                />
              }
              style={{
                flex: 1,
                background: "rgba(12, 12, 12, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "10px",
                padding: "6px 12px",
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  const isCallActive = (callState?.status === "active" || (callState?.status === "outgoing" && callState.callerId === currentUserId)) && callState.peerUser?.userId === selectedUser?.userId;

  return (
    <article
      className={`ct-chat-panel ${isCallActive ? "ct-chat-panel-plain flex flex-row" : "ct-chat-panel-plain"}`}
      style={{
        height: "100%",
        width: "100%",
        overflow: "hidden",
        padding: isCallActive ? 0 : undefined
      }}
    >
      {selectedUser ? (
        <>
          {isCallActive ? (
            <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
              {/* LEFT SIDE: EMBEDDED CALL STAGE */}
              <section 
                className="ct-lobby-stage-panel" 
                ref={stagePanelRef}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  overflow: "hidden",
                  position: "relative",
                  background: "#0a0a0a"
                }}
              >
                {/* Embedded Stage Toggle Chat Button */}
                <button
                  type="button"
                  className="ct-lobby-chat-toggle in-stage"
                  onClick={() => setIsChatOpen((prev) => !prev)}
                  style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    zIndex: 30,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    background: "rgba(18, 18, 18, 0.72)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    color: "rgba(255, 255, 255, 0.85)",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(24, 24, 24, 0.85)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.16)";
                    e.currentTarget.style.color = "#ffffff";
                    e.currentTarget.style.transform = "scale(1.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(18, 18, 18, 0.72)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.85)";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {isChatOpen ? (
                    <>
                      <RightOutlined style={{ fontSize: "11px" }} /> Sohbeti Kapat
                    </>
                  ) : (
                    <>
                      <LeftOutlined style={{ fontSize: "11px" }} /> Sohbeti Aç
                    </>
                  )}
                </button>

                {/* LobbyStageView */}
                <LobbyStageView
                  stageParticipantSlots={enhancedStageParticipantSlots}
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
                  onWatchScreen={onWatchScreen}
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
                />
              </section>

              {/* RIGHT SIDE: SLIDABLE CHAT */}
              <aside 
                style={{
                  width: isChatOpen ? "350px" : "0px",
                  opacity: isChatOpen ? 1 : 0,
                  borderLeft: isChatOpen ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "rgba(10, 10, 10, 0.98)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  overflow: "hidden"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <MessageOutlined style={{ color: "rgba(255,255,255,0.65)" }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>Sohbet</span>
                  </div>
                  <Button
                    type="text"
                    icon={<RightOutlined style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }} />}
                    onClick={() => setIsChatOpen(false)}
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
                      style={{
                        border: "1.5px solid rgba(255, 255, 255, 0.15)",
                        background: "#121212",
                      }}
                    />
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border border-[#0d0d0d] ${
                        selectedUser.appOnline ? "bg-emerald-500" : "bg-zinc-500"
                      }`}
                    />
                  </div>

                  <div className="ct-chat-user-header-main">
                    <h3>{selectedUser.displayName || selectedUser.username}</h3>
                    <span>@{selectedUser.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#8f8f8f] px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                    {getUserStatusLabel(selectedUser.appOnline)}
                  </span>
                  
                  {/* Call Mute Toggle Button */}
                  <Tooltip title={isMuted ? "Aramaları Sesi Aç" : "Aramaları Sessize Al"}>
                    <Button
                      type="text"
                      icon={
                        isMuted ? (
                          <BellFilled style={{ color: "#ef4444", fontSize: "16px" }} />
                        ) : (
                          <BellOutlined style={{ color: "rgba(255,255,255,0.45)", fontSize: "16px" }} />
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
                        icon={<PhoneOutlined style={{ color: "#22c55e", fontSize: "16px" }} />}
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
                      icon={<InfoCircleOutlined style={{ color: "rgba(255,255,255,0.45)", fontSize: "16px" }} />}
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
                    <div className="ct-call-pulse-avatar-container" style={{ position: "relative", width: "32px", height: "32px", flexShrink: 0 }}>
                      <Avatar
                        size={32}
                        src={selectedUser.avatarUrl}
                        icon={!selectedUser.avatarUrl && <UserOutlined />}
                        style={{
                          border: "1.5px solid rgba(255, 255, 255, 0.2)",
                          background: "#121212",
                          animation: "callAvatarDimPulse 2s infinite ease-in-out"
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {selectedUser.displayName || selectedUser.username} arıyor...
                      </span>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Gelen sesli/görüntülü arama
                      </span>
                    </div>
                  </div>
                  {/* Right side: Buttons */}
                  <div className="ct-banner-actions">
                    <Button
                      type="primary"
                      size="middle"
                      icon={<PhoneOutlined />}
                      onClick={onAcceptCall}
                      className="ct-banner-accept-btn"
                    >
                      Kabul Et
                    </Button>
                    <Button
                      danger
                      size="middle"
                      icon={<CloseOutlined />}
                      onClick={onRejectCall}
                      className="ct-banner-reject-btn"
                    >
                      Reddet
                    </Button>
                  </div>
                </div>
              )}

              {/* Rejoin Background Active Call Banner */}
              {ongoingCall && ongoingCall.peerUser.userId === selectedUser?.userId && callState?.status !== "active" && (
                <div className="ct-rejoin-banner">
                  <div className="ct-banner-text-content">
                    <PhoneOutlined style={{ color: "#10b981", fontSize: "14px", flexShrink: 0 }} />
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>Devam eden aktif bir sesli/görüntülü arama var.</span>
                  </div>
                  <Button
                    type="primary"
                    size="middle"
                    onClick={onRejoinCall}
                    className="ct-banner-rejoin-btn"
                  >
                    Katıl
                  </Button>
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
                color: "#f5f5f5",
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
                  style={{
                    border: "2px solid rgba(255, 255, 255, 0.15)",
                    background: "#161616",
                  }}
                />
                <span
                  className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#0a0a0a] ${
                    selectedUser.appOnline ? "bg-emerald-500" : "bg-zinc-500"
                  }`}
                />
              </div>

              <div>
                <h3 className="text-[17px] font-bold text-white leading-snug">
                  {selectedUser.displayName || selectedUser.username}
                </h3>
                <p className="text-[13px] text-[#8f8f8f] mt-0.5">@{selectedUser.username}</p>
              </div>

              <Tag color={selectedUser.role === "admin" ? "gold" : "default"} style={{ margin: 0, borderRadius: "4px" }}>
                {selectedUser.role === "admin" ? "Yönetici" : "Üye"}
              </Tag>
            </div>

            <Divider style={{ borderColor: "rgba(255, 255, 255, 0.08)", margin: "0 0 20px 0" }} />

            <Descriptions title={null} column={1} layout="horizontal" size="small" style={{ margin: 0 }}>
              <Descriptions.Item
                label={
                  <span className="text-[#8f8f8f] text-[12px] flex items-center gap-2">
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
                  <span className="text-[#8f8f8f] text-[12px] flex items-center gap-2">
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
                  <span className="text-[#8f8f8f] text-[12px] flex items-center gap-2">
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
                onClick={() => {
                  void onCopyUsername(selectedUser.username);
                  setIsUserPopupOpen(false);
                }}
                style={{
                  background: "rgba(25, 25, 25, 0.8)",
                  borderColor: "rgba(255, 255, 255, 0.08)",
                  color: "#f5f5f5",
                  borderRadius: "8px",
                  height: "38px",
                  fontSize: "12px",
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
                  style={{
                    marginTop: "10px",
                    background: "rgba(25, 25, 25, 0.8)",
                    borderColor: "rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    height: "38px",
                    fontSize: "12px",
                  }}
                >
                  {isSelectedUserBlocked
                    ? "Engeli Kaldır"
                    : "Kullanıcıyı Engelle"}
                </Button>
              )}

              {isSelectedUserBlocked && (
                <p
                  style={{
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.4)",
                    textAlign: "center",
                  }}
                >
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
        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center bg-[rgba(5,5,5,0.2)]" style={{ height: "100%" }}>
          <ExclamationCircleOutlined style={{ fontSize: "32px", color: "rgba(255,255,255,0.15)", marginBottom: "16px" }} />
          <h3 className="text-base font-semibold text-white mb-1">Bir Sohbet Seç</h3>
          <p className="text-xs text-[#8f8f8f] max-w-[280px]">
            Direkt mesajları görmek, dosya göndermek ve sesli/görüntülü bağlantı kurmak için soldaki listeden bir arkadaşını seçebilirsin.
          </p>
        </div>
      )}
    </article>
  );
}
