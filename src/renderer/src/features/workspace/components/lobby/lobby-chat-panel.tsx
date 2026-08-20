import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Input, Button, Tooltip, Spin, Alert } from "antd";
import type { InputRef } from "antd";
import {
  SendOutlined,
  DeleteOutlined,
  EditOutlined,
  EnterOutlined,
  SearchOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import { ConfirmActionModal } from "../common";
import {
  ChatAttachButton,
  ChatComposerEmojiButton,
  ChatAttachmentView,
  ChatMessageBody,
  ChatReactionButton,
  ChatReactionBar,
  ChatReplyQuote,
  formatAttachmentSize,
} from "../common/chat-message-parts";
import { ChatGifButton } from "../common/gif-picker";
import type { PendingAttachment } from "../../hooks/chat/use-direct-messages";
import {
  formatTimeLabel,
  getApiErrorMessage,
  getUsernameHue,
} from "../../workspace-utils";
import { renderMessageBody, type MentionCandidate } from "../../mentions";
import { MentionPicker, useMentionPicker } from "../common/mention-picker";

interface LobbyChatMessageRowProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isDeleting: boolean;
  deleteDisabled: boolean;
  currentUserId: string;
  // Decides which @name in the body is highlighted as aimed at you.
  currentUsername: string;
  onRequestDelete: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, body: string) => void;
  onToggleReaction: (messageId: string, emoji: string, add: boolean) => void;
}

// Every prop except the four callbacks. `message` is compared by reference
// because it comes straight out of the react-query cache, which replaces the
// object rather than mutating it — an edit or a new reaction is therefore a new
// identity and does re-render the row.
const areRowPropsEqual = (
  previous: LobbyChatMessageRowProps,
  next: LobbyChatMessageRowProps,
): boolean =>
  previous.message === next.message &&
  previous.isOwnMessage === next.isOwnMessage &&
  previous.isDeleting === next.isDeleting &&
  previous.deleteDisabled === next.deleteDisabled &&
  previous.currentUserId === next.currentUserId &&
  previous.currentUsername === next.currentUsername;

// One rendered message, memoized on primitives.
//
// The composer's draft lives in this panel's own state, so every keystroke
// re-rendered the entire backlog — up to 200 bubbles with an antd Button and
// Tooltip each.
//
// The comparator is explicit because three of the four callbacks are built as
// inline arrows at the call site: under the default shallow compare they are new
// on every render, so this memo never hit once and the keystroke cost it was
// added to remove was still being paid. Ignoring them is safe — they close over
// nothing but `message`, which IS compared, and only forward to the panel's own
// handlers. Same reasoning, same shape as LobbyParticipantTile.
const LobbyChatMessageRow = memo(function LobbyChatMessageRow({
  message,
  isOwnMessage,
  isDeleting,
  deleteDisabled,
  currentUserId,
  currentUsername,
  onRequestDelete,
  onReply,
  onEdit,
  onToggleReaction,
}: LobbyChatMessageRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.body);

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
            
          />
        ) : (
          message.body && (
            <ChatMessageBody body={message.body}>
              {renderMessageBody(message.body, currentUsername)}
            </ChatMessageBody>
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
            {/* <b>, not a <span>: `.ct-chat-bubble span` sets a muted colour and
                display: block, and both would beat a class on a span here. */}
            <b
              className="ct-chat-author"
              style={
                { "--ct-name-h": getUsernameHue(message.userId) } as CSSProperties
              }
            >
              {message.username}
            </b>
            {" • "}
            {formatTimeLabel(message.createdAt)}
            {message.editedAt ? " • düzenlendi" : ""}
          </span>

          <span className="ct-chat-message-actions">
            <ChatReactionButton
              onPick={(emoji) => {
                const existing = (message.reactions ?? []).find(
                  (reaction) => reaction.emoji === emoji,
                );
                const mine = existing?.userIds.includes(currentUserId) ?? false;
                onToggleReaction(message.id, emoji, !mine);
              }}
            />

            <Tooltip title="Yanıtla">
              <button
                type="button"
                className="ct-chat-action"
                onClick={() => onReply(message)}
                aria-label="Yanıtla"
              >
                <EnterOutlined />
              </button>
            </Tooltip>

            {isOwnMessage && message.body && (
              <Tooltip title="Düzenle">
                <button
                  type="button"
                  className="ct-chat-action"
                  onClick={() => {
                    setEditDraft(message.body);
                    setIsEditing(true);
                  }}
                  aria-label="Mesajı düzenle"
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            )}

            {isOwnMessage && (
              <Tooltip title={isDeleting ? "Siliniyor" : "Sil"}>
                <button
                  type="button"
                  className="ct-chat-action danger"
                  onClick={() => onRequestDelete(message.id)}
                  disabled={deleteDisabled}
                  aria-label="Mesajı sil"
                >
                  {isDeleting ? (
                    <div className="ct-spinner-small" />
                  ) : (
                    <DeleteOutlined />
                  )}
                </button>
              </Tooltip>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}, areRowPropsEqual);

interface LobbyChatPanelProps {
  currentUserId: string;
  currentUsername: string;
  // Voice roster. Unioned with the authors of the loaded messages, because a
  // text-only room has no roster at all -- nobody is "connected" to one -- and
  // in a voice lobby someone can be listening without having said anything.
  lobbyMembers?: LobbyStateMember[];
  lobbyMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  lobbyMessages: ChatMessage[];
  lobbyMessageDraft: string;
  setLobbyMessageDraft: Dispatch<SetStateAction<string>>;
  // Sends the draft. With a body it sends that instead and leaves the draft
  // alone -- see the GIF button below for why that override has to exist.
  onSendLobbyMessage: (bodyOverride?: string) => void;
  onDeleteLobbyMessage: (messageId: string) => void;
  isSendingLobbyMessage: boolean;
  deletingLobbyMessageId: string | null;
  replyTo?: ChatMessage | null;
  onSetReplyTo?: (message: ChatMessage | null) => void;
  pendingAttachment?: PendingAttachment | null;
  onSetPendingAttachment?: (value: PendingAttachment | null) => void;
  onEditMessage?: (messageId: string, body: string) => void;
  onToggleReaction?: (messageId: string, emoji: string, add: boolean) => void;
  searchQuery?: string;
  searchResults?: ChatMessage[] | null;
  isSearching?: boolean;
  onRunSearch?: (query: string) => void;
  onClearSearch?: () => void;
}

export function LobbyChatPanel({
  currentUserId,
  currentUsername,
  lobbyMembers = [],
  lobbyMessagesQuery,
  lobbyMessages,
  lobbyMessageDraft,
  setLobbyMessageDraft,
  onSendLobbyMessage,
  onDeleteLobbyMessage,
  isSendingLobbyMessage,
  deletingLobbyMessageId,
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
}: LobbyChatPanelProps) {
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<
    string | null
  >(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<InputRef>(null);

  // Who can be named here: the voice roster plus everyone who has posted. The
  // roster alone is wrong for a text-only room, which nobody connects to, and
  // the authors alone miss the people sitting in voice saying nothing.
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const byUserId = new Map<string, MentionCandidate>();

    for (const member of lobbyMembers) {
      if (member.userId !== currentUserId && member.username) {
        byUserId.set(member.userId, {
          userId: member.userId,
          username: member.username,
        });
      }
    }

    for (const message of lobbyMessages) {
      if (message.userId !== currentUserId && message.username) {
        byUserId.set(message.userId, {
          userId: message.userId,
          username: message.username,
        });
      }
    }

    return [...byUserId.values()].sort((a, b) =>
      a.username.localeCompare(b.username, "tr"),
    );
  }, [currentUserId, lobbyMembers, lobbyMessages]);

  const mentionPicker = useMentionPicker({
    draft: lobbyMessageDraft,
    onDraftChange: setLobbyMessageDraft,
    candidates: mentionCandidates,
    inputRef: composerInputRef,
  });

  // How far from the bottom the button appears.
  //
  // It used to be revealed by `@container scroll-state(scrollable: bottom)`,
  // which is true whenever there is ANY content below the fold — one pixel of
  // scrolling was enough, so reading the message above the last one covered the
  // thread with a jump-to-newest button. A distance is the thing being asked
  // about, and CSS scroll-state cannot express one.
  const SCROLL_BUTTON_THRESHOLD_PX = 220;

  // How close to the bottom still counts as "following the conversation".
  // Tighter than the button's threshold: the button is about whether there is
  // enough below to be worth a shortcut, this is about whether the reader has
  // deliberately scrolled away.
  const PINNED_THRESHOLD_PX = 150;

  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  // A ref, not state: the observer below reads it during layout, before a state
  // update from the same frame would be visible.
  const isPinnedToBottomRef = useRef(true);

  const handleMessagesScroll = (): void => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isPinnedToBottomRef.current = distance <= PINNED_THRESHOLD_PX;
    const away = distance > SCROLL_BUTTON_THRESHOLD_PX;
    // Only on a real change: this runs on every scroll frame.
    setIsAwayFromBottom((previous) => (previous === away ? previous : away));
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      // Set before the animation starts: a smooth scroll takes a few hundred
      // milliseconds, and asking to follow the conversation again should survive
      // an image finishing in the middle of it.
      isPinnedToBottomRef.current = true;
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Whether this panel has already been placed at the newest message once.
  //
  // Switching to Arkadaşlar or Ayarlar UNMOUNTS this panel (WorkspaceMainPanel
  // renders one section at a time), so coming back mounts it fresh with
  // scrollTop 0 — which the "am I near the bottom" test below reads as "the
  // reader has scrolled up to the top", and the thread stayed pinned to the
  // oldest loaded message. A first mount has no reading position to preserve;
  // it must always land on the newest message.
  const hasLandedAtNewestRef = useRef(false);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || lobbyMessages.length === 0) {
      return;
    }

    if (!hasLandedAtNewestRef.current) {
      hasLandedAtNewestRef.current = true;
      isPinnedToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      setIsAwayFromBottom(false);
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      PINNED_THRESHOLD_PX;
    if (isNearBottom || lobbyMessages.length <= 1) {
      isPinnedToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      // Jumped to the end without a scroll event necessarily firing.
      setIsAwayFromBottom(false);
    }
  }, [lobbyMessages.length]);

  // Re-pin while the thread is still growing.
  //
  // This is what made "switch to another screen and come back" land in the
  // middle of the history. The effect above sets scrollTop to the scrollHeight it
  // can see, and on a remount with a warm cache every message renders at once —
  // images, GIFs and attachments included, none of which has any height until its
  // bytes arrive. So the target was computed against a short document, and each
  // picture that finished loading pushed the thread further down past the
  // viewport. Staying pinned until the layout settles is the only way to land on
  // the newest message; a one-shot scroll cannot know how tall the content will
  // end up being.
  //
  // Only while pinned: a reader who has scrolled up must not be yanked back by an
  // image loading below them.
  //
  // Bound through a callback ref rather than an effect, because the list element
  // is a different node depending on whether search results have taken over the
  // thread — a dependency list would have to predict that, and React already
  // calls this on every attach and detach.
  const listResizeObserverRef = useRef<ResizeObserver | null>(null);

  const attachMessageList = useCallback((node: HTMLDivElement | null): void => {
    listResizeObserverRef.current?.disconnect();
    listResizeObserverRef.current = null;

    if (!node) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const container = messagesContainerRef.current;
      if (!container || !isPinnedToBottomRef.current) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    });

    observer.observe(node);
    listResizeObserverRef.current = observer;
  }, []);

  const showEmptyState =
    !lobbyMessagesQuery.isPending &&
    !lobbyMessagesQuery.isError &&
    Boolean(lobbyMessagesQuery.data?.ok) &&
    lobbyMessages.length === 0;

  return (
    <section className="ct-lobby-chat-panel" >
      <div className="ct-chat-thread-box" >
        {onRunSearch && (
          <div className="ct-chat-search">
            <Input
              allowClear
              size="small"
              value={searchQuery}
              placeholder="Bu lobide ara…"
              prefix={<SearchOutlined  />}
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
          ref={messagesContainerRef}
          className="ct-chat-messages"
          onScroll={handleMessagesScroll}
        >
          {lobbyMessagesQuery.isPending && (
            <div className="ct-list-state">
              <Spin size="small" />
              <span >Sohbet yükleniyor...</span>
            </div>
          )}

          {!lobbyMessagesQuery.isPending && lobbyMessagesQuery.isError && (
            <div className="ct-chat-notice">
              <Alert
                message="Hata"
                description={`Sohbet alınamadı: ${lobbyMessagesQuery.error.message}`}
                type="error"
                showIcon
                className="ct-alert"
              />
            </div>
          )}

          {!lobbyMessagesQuery.isPending &&
            !lobbyMessagesQuery.isError &&
            !lobbyMessagesQuery.data?.ok && (
              <div className="ct-chat-notice">
                <Alert
                  message="Hata"
                  description={`Sohbet alınamadı: ${getApiErrorMessage(lobbyMessagesQuery.data?.error)}`}
                  type="error"
                  showIcon
                  className="ct-alert"
                />
              </div>
            )}

          {searchResults === null && showEmptyState && (
            <div className="ct-list-state ct-chat-empty-state" >
              <p className="text-xs text-ct-text-muted">Bu lobide henüz mesaj yok. İlk mesajı sen gönder!</p>
            </div>
          )}

          {searchResults !== null && (
            <div className="ct-chat-message-list" ref={attachMessageList}>
              <div
                className="ct-chat-search-summary"
              >
                {isSearching
                  ? "Aranıyor…"
                  : `"${searchQuery}" için ${searchResults.length} sonuç`}
              </div>
              {searchResults.map((message) => (
                <LobbyChatMessageRow
                  key={`search-${message.id}`}
                  message={message}
                  isOwnMessage={message.userId === currentUserId}
                  isDeleting={false}
                  deleteDisabled
                  currentUserId={currentUserId}
                  currentUsername={currentUsername}
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
            <div className="ct-chat-message-list" ref={attachMessageList}>
              {lobbyMessages.map((message) => (
                <LobbyChatMessageRow
                  key={message.id}
                  message={message}
                  isOwnMessage={message.userId === currentUserId}
                  isDeleting={deletingLobbyMessageId === message.id}
                  deleteDisabled={Boolean(deletingLobbyMessageId)}
                  currentUserId={currentUserId}
                  currentUsername={currentUsername}
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

          <button
            type="button"
            className={`ct-scroll-to-bottom-btn ${isAwayFromBottom ? "visible" : ""}`}
            aria-hidden={!isAwayFromBottom}
            tabIndex={isAwayFromBottom ? 0 : -1}
            onClick={scrollToBottom}
          >
            En Yeni Mesajlara Git
          </button>
        </div>

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
              disabled={isSendingLobbyMessage}
              // Appended through the updater, not by reading the draft above.
              // The picker stays open, so a run of quick picks lands inside one
              // render — every closure would read the same stale draft and each
              // emoji would overwrite the last, which is what made a second
              // emoji look like it did nothing.
              onPick={(emoji) =>
                setLobbyMessageDraft((previous) => previous + emoji)
              }
            />
            {/* The GIF goes out as its own message. It used to be written into
                the draft and sent a render later, which silently destroyed
                whatever the user had typed: "şuna bak" + pick a GIF = "şuna
                bak" gone, with no undo. */}
            <ChatGifButton
              disabled={isSendingLobbyMessage}
              onPick={(url) => onSendLobbyMessage(url)}
            />
            <ChatAttachButton
              disabled={isSendingLobbyMessage}
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
                pendingAttachment
                  ? "Açıklama (isteğe bağlı)…"
                  : "Lobiye mesaj yaz..."
              }
              value={lobbyMessageDraft}
              onChange={(event) => {
                setLobbyMessageDraft(event.target.value);
                mentionPicker.syncCaret();
              }}
              onSelect={mentionPicker.syncCaret}
              onBlur={mentionPicker.close}
              onKeyDown={(event) => {
                // Escape belongs to the picker first; it only drops the reply
                // once there is no picker left to close.
                if (mentionPicker.handleKeyDown(event)) {
                  return;
                }
                if (event.key === "Escape" && replyTo) {
                  onSetReplyTo?.(null);
                }
              }}
              onPressEnter={(event) => {
                // The list is open: Enter is picking a name, not sending.
                if (mentionPicker.isOpen) {
                  return;
                }
                if (
                  !event.shiftKey &&
                  (lobbyMessageDraft.trim() || pendingAttachment)
                ) {
                  event.preventDefault();
                  onSendLobbyMessage();
                }
              }}
              disabled={isSendingLobbyMessage}
              suffix={
                <Button
                  type="text"
                  icon={<SendOutlined  />}
                  // Wrapped, not passed directly: onClick hands the handler a
                  // MouseEvent, which would arrive as the body override and be
                  // sent as the message.
                  onClick={() => onSendLobbyMessage()}
                  loading={isSendingLobbyMessage}
                  disabled={
                    isSendingLobbyMessage ||
                    (!lobbyMessageDraft.trim() && !pendingAttachment)
                  }
                  className="ct-chat-send-btn"
                />
              }
              className="ct-chat-input"
            />
          </div>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={pendingDeleteMessageId !== null}
        title="Mesajı Sil"
        message="Bu mesaj kalıcı olarak silinecek. Devam etmek istiyor musun?"
        confirmLabel="Mesajı Sil"
        isProcessing={
          pendingDeleteMessageId !== null &&
          deletingLobbyMessageId === pendingDeleteMessageId
        }
        onCancel={() => setPendingDeleteMessageId(null)}
        onConfirm={() => {
          if (!pendingDeleteMessageId) {
            return;
          }

          onDeleteLobbyMessage(pendingDeleteMessageId);
          setPendingDeleteMessageId(null);
        }}
      />
    </section>
  );
}


