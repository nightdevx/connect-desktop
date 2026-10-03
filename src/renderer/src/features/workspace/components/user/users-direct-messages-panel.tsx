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
import { Drawer, Input, Button, Tag, Avatar, Tooltip } from "antd";
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
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
  hueStyle,
} from "../../workspace-utils";
import { gameActivityLabel, useGameActivityByUser } from "@/features/minigames";
import { ModalHeading } from "@/ui/modal-heading";
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
import { useConnectionQuality, type ParticipantConnectionQuality } from "@/features/livekit";
import type {
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { CallSessionState } from "../../hooks";
import type { OngoingCallInfo } from "../../hooks/user/use-call-session";
import workspaceService from "../../services";
import { useUiStore } from "@/store/ui-store";
import { DirectChatMessageRow } from "./direct-chat-message-row";
import { GameArt } from "./game-art";
import { CallEncryptionBadge } from "./parts/CallEncryptionBadge";
import { useThreadScroll } from "./use-thread-scroll";
import { ElapsedTime } from "../common/elapsed-time";
import { pairCallLog, readMutedCallers, setCallerMuted } from "../../hooks/user/call-log";

// Mention matching, highlighting and "was I named" live in ../../mentions so the
// lobby composer and this message list share one set of rules. Re-exported
// because callers already import mentionsUser from here.
export { mentionsUser } from "../../mentions";


// The other side's connection, as three bars beside the call time. Nothing
// until LiveKit has reported on it.
const QUALITY_BARS: Record<ParticipantConnectionQuality, number> = {
  excellent: 3,
  good: 3,
  poor: 2,
  lost: 1,
  unknown: 0,
};

const QUALITY_LABEL: Record<ParticipantConnectionQuality, string> = {
  excellent: "Bağlantı iyi",
  good: "Bağlantı iyi",
  poor: "Bağlantı zayıf",
  lost: "Bağlantı koptu",
  unknown: "",
};

function CallQualityBars({ userId }: { userId: string }) {
  const quality = useConnectionQuality(userId);
  const bars = QUALITY_BARS[quality];
  if (!bars) {
    return null;
  }
  return (
    <Tooltip title={QUALITY_LABEL[quality]}>
      <span className={`ct-quality-bars level-${bars}`} aria-label={QUALITY_LABEL[quality]}>
        <i />
        <i />
        <i />
      </span>
    </Tooltip>
  );
}

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
  /** Back to the friends page; the conversation stays in the sidebar. */
  onCloseConversation?: () => void;
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
  onCloseConversation,
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

  // Two people in the thread: the peer, and you -- whose picture comes from the
  // directory, which carries your own entry.
  const avatarFor = (userId: string) =>
    userId === currentUserId ? avatarByUserId?.[currentUserId] : selectedUser?.avatarUrl;

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

  // Persisted, for the same reason as the lobby's: this panel is unmounted on
  // every workspace section change, so a closed thread came back open.
  const isChatOpen = useUiStore((state) => state.viewPreferences.callChatOpen);
  const isCallActive =
    (callState?.status === "active" ||
      (callState?.status === "outgoing" &&
        callState.callerId === currentUserId)) &&
    callState.peerUser?.userId === selectedUser?.userId;

  const focusComposer = useCallback((): void => {
    // cursor: "end" matters on a remount — the call view renders the composer
    // from a different branch, so starting a call builds a fresh input whose
    // caret would otherwise sit at index 0, in front of the draft.
    composerInputRef.current?.focus({ cursor: "end" });
  }, []);

  // Opening a thread should let you type immediately.
  const selectedUserId = selectedUser?.userId;
  useEffect(() => {
    if (!selectedUserId) {
      return;
    }
    // During a call the composer lives in a drawer that is collapsed to zero
    // width rather than hidden, so it stays focusable: focusing it there puts
    // the caret in an invisible, aria-hidden box and swallows every keystroke.
    // Closing the drawer while typing walks into the same box from the other
    // side, so focus has to be released, not merely withheld.
    if (isCallActive && !isChatOpen) {
      const element = composerInputRef.current?.input;
      if (element && document.activeElement === element) {
        element.blur();
      }
      return;
    }
    focusComposer();
  }, [selectedUserId, isCallActive, isChatOpen, focusComposer]);

  // The send button takes focus on click, so the caret has to be put back
  // explicitly after every send.
  const sendAndRefocus = useCallback(
    (bodyOverride?: string): void => {
      onSendMessage(bodyOverride);
      focusComposer();
    },
    [onSendMessage, focusComposer],
  );

  // Whether this person's calls ring. Re-read when an incoming call changes
  // state too: the ringing card can mute them from outside this panel.
  useEffect(() => {
    setIsMuted(
      selectedUser ? readMutedCallers().includes(selectedUser.userId) : false,
    );
  }, [selectedUser, callState?.isMuted]);

  const handleToggleMuteCalls = () => {
    if (!selectedUser) return;
    setCallerMuted(selectedUser.userId, !isMuted);
    setIsMuted(!isMuted);
  };

  // What the person in this conversation is doing, for the header's second
  // line: the room before the game, as on the friends page.
  const gameActivityByUser = useGameActivityByUser();
  const headerActivity = ((): { label: string; game?: string } | null => {
    if (!selectedUser?.appOnline) {
      return null;
    }
    const lobby = friendsHome?.lobbyByUserId?.[selectedUser.userId];
    if (lobby) {
      return { label: `${lobby.name} odasında` };
    }
    const minigame = gameActivityByUser.get(selectedUser.userId);
    if (minigame) {
      return { label: gameActivityLabel(minigame) };
    }
    const game = selectedUser.activity?.name;
    return game ? { label: `${game} oynuyor`, game } : null;
  })();

  // One entry per finished call: the "ended" message carries the duration and
  // the "started" one it closes is folded into it.
  const callLogInfo = useMemo(() => pairCallLog(directMessages), [directMessages]);
  // "Geri ara" on a missed or declined call, while nothing else is ringing.
  const handleCallBack =
    onInitiateCall && selectedUser?.appOnline && (!callState || callState.status === "idle")
      ? () => onInitiateCall(selectedUser)
      : undefined;

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

  const { stageAreaRef, stageLayoutStyle } = useLobbyStageLayout(
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
                  avatarUrl={avatarFor(message.userId)}
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
                  callLog={callLogInfo.get(message.id)}
                  onCallBack={handleCallBack}
                  avatarUrl={avatarFor(message.userId)}
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
            <div className="ct-composer-chip reply">
              <span className="ct-composer-chip-label">Yanıt</span>
              <div className="ct-composer-chip-text">
                <ChatReplyQuote
                  replyTo={{
                    id: replyTo.id,
                    username: replyTo.username,
                    body: replyTo.body.slice(0, 120),
                  }}
                />
              </div>
              <Tooltip title="Yanıtı iptal et (Esc)">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => onSetReplyTo?.(null)}
                  aria-label="Yanıtı iptal et"
                />
              </Tooltip>
            </div>
          )}

          {pendingAttachment && (
            <div className="ct-composer-chip">
              <span className="ct-composer-chip-label">Dosya</span>
              <span className="ct-composer-chip-text">
                {pendingAttachment.name} ·{" "}
                {formatAttachmentSize(pendingAttachment.size)}
              </span>
              <Tooltip title="Dosyayı kaldır">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => onSetPendingAttachment?.(null)}
                  aria-label="Dosyayı kaldır"
                />
              </Tooltip>
            </div>
          )}

          <div className="ct-chat-composer-row">
            <ChatComposerEmojiButton
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
              onPick={(url) => sendAndRefocus(url)}
            />
            <ChatAttachButton
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
              // Focus returns here after a send or a GIF pick; without this the
              // picker stays latched closed from the blur that preceded it and
              // an unfinished @mention never completes.
              onFocus={mentionPicker.syncCaret}
              onBlur={mentionPicker.close}
              onKeyDown={(event) => {
                // Consumes Enter/Tab/arrows while the list is open, so picking
                // a name does not also send the message. It reports whether it
                // took the key -- Escape belongs to the picker first, and only
                // drops the reply once there is no picker to close.
                if (mentionPicker.handleKeyDown(event)) {
                  return;
                }
                if (event.key === "Escape" && replyTo) {
                  onSetReplyTo?.(null);
                }
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
                  sendAndRefocus();
                }
              }}
              // Deliberately neither disabled nor readOnly while sending: a
              // disabled input is blurred by the browser and never gets focus
              // back (that was the vanishing caret), and readOnly eats
              // keystrokes with no visual or screen-reader signal at all. The
              // double-send guard sits in handleSendMessage.
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
                  onClick={() => sendAndRefocus()}
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

  return (
    // friends-mode drops the panel's gutter: the friends home is banded --
    // header, toolbar, list -- and its dividers have to reach the panel edge.
    // The thread view keeps the gutter it has always had.
    <article
      className={`ct-chat-panel ct-chat-panel-plain ${isCallActive ? "in-call" : ""} ${selectedUser ? (isCallActive ? "" : "dm") : "friends-mode"}`}
    >
      {selectedUser ? (
        <>
          {isCallActive ? (
            <div className="ct-call-split">
              {/* LEFT SIDE: EMBEDDED CALL STAGE */}
              <section className="ct-lobby-stage-panel ct-call-stage">
                {/* What the call is doing: ringing while the other side has
                    not picked up, then the running time and the connection. */}
                <span
                  className={`ct-call-stage-status ${callState?.status === "active" ? "" : "ringing"}`}
                  role="status"
                >
                  {callState?.status === "active" ? (
                    <>
                      <span className="ct-online-dot" aria-hidden="true" />
                      Görüşme sürüyor
                      {callState.connectedAt && <ElapsedTime since={callState.connectedAt} />}
                      {selectedUser && <CallQualityBars userId={selectedUser.userId} />}
                      <CallEncryptionBadge />
                    </>
                  ) : (
                    <>
                      Aranıyor
                      <span className="ct-ring-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </>
                  )}
                </span>

                {/* The measured box: its padding is the stage's breathing
                    room, and useLobbyStageLayout fits the tiles to whatever
                    content box is left over. */}
                <div className="ct-lobby-stage-area" ref={stageAreaRef}>
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
                </div>

                {/* LobbyActionToolbar */}
                {/* micLocked is never set here. A moderator mute is a lobby
                    restriction, and the token path exempts call rooms for the
                    same reason: a one-to-one call is between two people who
                    chose to be in it and can hang up. */}
                <LobbyActionToolbar
                  micEnabled={micEnabled || false}
                  micLocked={false}
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
                  onToggleChat={() => setViewPreference("callChatOpen", !isChatOpen)}
                  isChatOpen={isChatOpen}
                  leaveLabel="Aramayı bitir"
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
                  userId={contextMenuParticipantId}
                  name={nameByUserId[contextMenuParticipantId] ?? "Katılımcı"}
                  avatarUrl={avatarByUserId?.[contextMenuParticipantId]}
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
              {/* The conversation's bar, the same height and surface as a
                  room's: who, what they are doing, and the call controls. The
                  identity half opens the profile drawer. */}
              <header className="ct-dm-header">
                <button
                  type="button"
                  className="ct-dm-header-identity"
                  onClick={() => setIsUserPopupOpen(true)}
                  aria-label={`${selectedUser.displayName || selectedUser.username} profilini aç`}
                >
                  <span className="ct-user-avatar with-presence" aria-hidden="true" style={hueStyle(selectedUser.userId)}>
                    <span className="ct-user-avatar-core ct-hued">
                      {selectedUser.avatarUrl ? (
                        <img className="ct-user-avatar-image" src={selectedUser.avatarUrl} alt="" />
                      ) : (
                        <span className="ct-user-avatar-fallback">
                          {getDisplayInitials(selectedUser.displayName || selectedUser.username)}
                        </span>
                      )}
                    </span>
                    <span
                      className="ct-presence-dot"
                      style={{
                        background: getPresenceColor(
                          selectedUser.appOnline,
                          selectedUser.presence,
                        ),
                      }}
                    />
                  </span>

                  <span className="ct-dm-header-text">
                    <strong title={selectedUser.displayName || selectedUser.username}>
                      {selectedUser.displayName || selectedUser.username}
                    </strong>
                    {/* A conversation seeded from history -- or opened by a
                        call -- knows a non-friend's display name and nothing
                        else, so the handle is only shown when it is known. */}
                    <span>
                      {headerActivity?.game && <GameArt name={headerActivity.game} size="xs" />}
                      {headerActivity?.label ??
                        getUserStatusLabel(selectedUser.appOnline, selectedUser.presence)}
                      {selectedUser.username && ` · @${selectedUser.username}`}
                    </span>
                  </span>
                </button>

                <div className="ct-dm-header-actions">
                  <Tooltip title={isMuted ? "Aramaların sesini aç" : "Aramaları sessize al"}>
                    <Button
                      type="text"
                      className={`ct-row-action ${isMuted ? "danger" : "neutral"}`}
                      icon={isMuted ? <BellFilled className="ct-icon-danger" /> : <BellOutlined />}
                      aria-pressed={isMuted}
                      aria-label="Aramaları sessize al"
                      onClick={handleToggleMuteCalls}
                    />
                  </Tooltip>

                  {/* Offline gets no button rather than a dead one, as on the
                      friends page: the call would ring into nothing. */}
                  {onInitiateCall && selectedUser.appOnline && (
                    <Tooltip title="Sesli ara">
                      <Button
                        type="text"
                        className="ct-row-action success"
                        icon={<PhoneOutlined />}
                        aria-label={`${selectedUser.displayName || selectedUser.username} kişisini ara`}
                        onClick={() => onInitiateCall(selectedUser)}
                      />
                    </Tooltip>
                  )}

                  <Tooltip title="Profil">
                    <Button
                      type="text"
                      className="ct-row-action neutral"
                      icon={<InfoCircleOutlined />}
                      aria-label="Profili aç"
                      onClick={() => setIsUserPopupOpen(true)}
                    />
                  </Tooltip>

                  {onCloseConversation && (
                    <Tooltip title="Sohbeti kapat">
                      <Button
                        type="text"
                        className="ct-row-action neutral"
                        icon={<CloseOutlined />}
                        aria-label="Sohbeti kapat"
                        onClick={onCloseConversation}
                      />
                    </Tooltip>
                  )}
                </div>
              </header>

              {/* The same ringing call as the corner card, where the user is
                  already looking: in the conversation with the caller. */}
              {callState?.status === "incoming" && callState.callerId === selectedUser?.userId && (
                <div className="ct-incoming-call-banner">
                  <div className="ct-banner-text-content">
                    <span className="ct-ring-ripple">
                      <Avatar
                        size={32}
                        src={selectedUser.avatarUrl}
                        icon={!selectedUser.avatarUrl && <UserOutlined />}
                      />
                    </span>
                    <div className="ct-banner-lines">
                      <strong>
                        {selectedUser.displayName || selectedUser.username} arıyor…
                      </strong>
                      <span>Gelen sesli arama</span>
                    </div>
                  </div>

                  {/* Plain buttons, the same pair as the corner card: an antd
                      Button brought nothing here but a cssinjs sheet to out-shout.
                      Answer on the right, as on a phone. */}
                  <div className="ct-banner-actions">
                    <button
                      type="button"
                      onClick={onRejectCall}
                      className="ct-call-answer reject"
                    >
                      <PhoneOutlined rotate={225} />
                      Reddet
                    </button>
                    <button
                      type="button"
                      onClick={onAcceptCall}
                      className="ct-call-answer accept"
                    >
                      <PhoneOutlined />
                      Kabul et
                    </button>
                  </div>
                </div>
              )}

              {/* Rejoin Background Active Call Banner */}
              {ongoingCall && ongoingCall.peerUser.userId === selectedUser?.userId && callState?.status !== "active" && (
                <div className="ct-rejoin-banner">
                  <div className="ct-banner-text-content">
                    <PhoneOutlined className="ct-icon-success" />
                    <span>Bu kişiyle devam eden bir aramanız var.</span>
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
            title={<ModalHeading icon={<UserOutlined />} title="Kullanıcı Profili" />}
            rootClassName="ct-user-drawer"
            // Close at the right, where the modals keep theirs.
            closable={{ placement: "end" }}
            placement="right"
            onClose={() => setIsUserPopupOpen(false)}
            open={isUserPopupOpen}
            size={340}
          >
            <div className="ct-user-drawer-identity">
              <span className="ct-user-drawer-avatar">
                <Avatar
                  size={96}
                  src={selectedUser.avatarUrl}
                  icon={!selectedUser.avatarUrl && <UserOutlined />}
                />
                <span
                  className="ct-presence-dot"
                  style={{
                    background: getPresenceColor(
                      selectedUser.appOnline,
                      selectedUser.presence,
                    ),
                  }}
                />
              </span>

              <h3>{selectedUser.displayName || selectedUser.username}</h3>
              {selectedUser.username && <p>@{selectedUser.username}</p>}

              <Tag className={`ct-tag ${selectedUser.role === "admin" ? "warn" : ""}`}>
                {selectedUser.role === "admin" ? "Yönetici" : "Üye"}
              </Tag>
            </div>

            <dl className="ct-user-drawer-facts">
              <div>
                <dt>
                  <SafetyOutlined /> Rol
                </dt>
                <dd>{selectedUser.role === "admin" ? "Yönetici" : "Üye"}</dd>
              </div>
              <div>
                <dt>
                  <CalendarOutlined /> Katılım tarihi
                </dt>
                <dd>{formatDateLabel(selectedUser.createdAt)}</dd>
              </div>
              <div>
                <dt>
                  <GlobalOutlined /> Durum
                </dt>
                <dd>
                  {headerActivity?.label ??
                    getUserStatusLabel(selectedUser.appOnline, selectedUser.presence)}
                </dd>
              </div>
            </dl>

            <div className="ct-user-drawer-actions">
              <Button
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
                  danger={!isSelectedUserBlocked}
                  block
                  loading={isBlockUpdating}
                  onClick={() => {
                    void onToggleBlocked(selectedUser.userId);
                  }}
                >
                  {isSelectedUserBlocked
                    ? "Engeli Kaldır"
                    : "Kullanıcıyı Engelle"}
                </Button>
              )}

              {isSelectedUserBlocked && (
                <p className="ct-field-hint">
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
