import { memo, useMemo, useState, useRef, useEffect } from "react";
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
import { formatTimeLabel, getApiErrorMessage } from "../../workspace-utils";
import { renderWithMentions, type MentionCandidate } from "../../mentions";
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

// One rendered message, memoized on primitives.
//
// The composer's draft lives in this panel's own state, so every keystroke
// re-rendered the entire backlog — up to 200 bubbles with an antd Button and
// Tooltip each. onRequestDelete is a setState updater, so its identity is
// stable and the default shallow compare is enough.
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
              {renderWithMentions(message.body, currentUsername)}
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
            {message.username} • {formatTimeLabel(message.createdAt)}
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
});

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
  setLobbyMessageDraft: (value: string) => void;
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

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom || lobbyMessages.length <= 1) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [lobbyMessages.length]);

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
          
        >
          <div className="ct-scroll-indicator top" />

          {lobbyMessagesQuery.isPending && (
            <div className="ct-list-state">
              <Spin size="small" />
              <span >Sohbet yükleniyor...</span>
            </div>
          )}

          {!lobbyMessagesQuery.isPending && lobbyMessagesQuery.isError && (
            <div className="ct-chat-search">
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
              <div className="ct-chat-search">
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
              <p className="text-xs text-[#5f5f5f]">Bu lobide henüz mesaj yok. İlk mesajı sen gönder!</p>
            </div>
          )}

          {searchResults !== null && (
            <div className="ct-chat-message-list">
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
            <div className="ct-chat-message-list">
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

          <div className="ct-scroll-indicator bottom" />
          <button
            type="button"
            className="ct-scroll-to-bottom-btn"
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
            <div
              className="ct-composer-chip"
            >
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
            <div
              className="ct-composer-chip"
            >
              <span
                className="ct-composer-chip-text"
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

          <div className="ct-chat-composer-row">
            <ChatComposerEmojiButton
              disabled={isSendingLobbyMessage}
              onPick={(emoji) => setLobbyMessageDraft(lobbyMessageDraft + emoji)}
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
                mentionPicker.handleKeyDown(event);
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


