import { memo, useState, useRef, useEffect } from "react";
import { Input, Button, Tooltip, Spin, Alert } from "antd";
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
import type { DesktopResult } from "@shared/desktop-api-types";
import { ConfirmActionModal } from "../common";
import {
  ChatAttachButton,
  ChatAttachmentView,
  ChatQuickReactionPicker,
  ChatReactionBar,
  ChatReplyQuote,
  formatAttachmentSize,
} from "../common/chat-message-parts";
import type { PendingAttachment } from "../../hooks/chat/use-direct-messages";
import { formatTimeLabel, getApiErrorMessage } from "../../workspace-utils";

interface LobbyChatMessageRowProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isDeleting: boolean;
  deleteDisabled: boolean;
  currentUserId: string;
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
            <p >{message.body}</p>
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

        <div
          className="ct-chat-bubble-meta"
          
        >
          <span >
            {message.username} • {formatTimeLabel(message.createdAt)}
            {message.editedAt ? " • düzenlendi" : ""}
          </span>

          <span >
            <ChatQuickReactionPicker
              onPick={(emoji) => {
                const existing = (message.reactions ?? []).find(
                  (reaction) => reaction.emoji === emoji,
                );
                const mine = existing?.userIds.includes(currentUserId) ?? false;
                onToggleReaction(message.id, emoji, !mine);
              }}
            />

            <Tooltip title="Yanıtla">
              <Button
                type="text"
                shape="circle"
                size="small"
                icon={<EnterOutlined  />}
                onClick={() => onReply(message)}
                className="ct-chat-message-delete"
              />
            </Tooltip>

            {isOwnMessage && message.body && (
              <Tooltip title="Mesajı Düzenle">
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  icon={<EditOutlined  />}
                  onClick={() => {
                    setEditDraft(message.body);
                    setIsEditing(true);
                  }}
                  className="ct-chat-message-delete"
                />
              </Tooltip>
            )}

            {isOwnMessage && (
              <Tooltip title="Mesajı Sil">
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  danger
                  icon={
                    isDeleting ? (
                      <Spin size="small" />
                    ) : (
                      <DeleteOutlined  />
                    )
                  }
                  onClick={() => onRequestDelete(message.id)}
                  disabled={deleteDisabled}
                  className="ct-chat-message-delete"
                />
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
  lobbyMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  lobbyMessages: ChatMessage[];
  lobbyMessageDraft: string;
  setLobbyMessageDraft: (value: string) => void;
  onSendLobbyMessage: () => void;
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

        <div className="ct-chat-composer" >
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
              placeholder={
                pendingAttachment
                  ? "Açıklama (isteğe bağlı)…"
                  : "Lobiye mesaj yaz..."
              }
              value={lobbyMessageDraft}
              onChange={(event) => setLobbyMessageDraft(event.target.value)}
              onPressEnter={(event) => {
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
                  onClick={onSendLobbyMessage}
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


