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
const iconButtonStyle = {
  width: "20px",
  height: "20px",
  minWidth: "20px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255,255,255,0.45)",
  border: "none",
  background: "transparent",
} as const;

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
            style={{ fontSize: 13 }}
          />
        ) : (
          message.body && (
            <p style={{ margin: 0, wordBreak: "break-word" }}>{message.body}</p>
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
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "4px",
          }}
        >
          <span style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.35)" }}>
            {message.username} • {formatTimeLabel(message.createdAt)}
            {message.editedAt ? " • düzenlendi" : ""}
          </span>

          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
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
                icon={<EnterOutlined style={{ fontSize: "11px" }} />}
                onClick={() => onReply(message)}
                style={iconButtonStyle}
              />
            </Tooltip>

            {isOwnMessage && message.body && (
              <Tooltip title="Mesajı Düzenle">
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: "11px" }} />}
                  onClick={() => {
                    setEditDraft(message.body);
                    setIsEditing(true);
                  }}
                  style={iconButtonStyle}
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
                      <DeleteOutlined style={{ fontSize: "11px" }} />
                    )
                  }
                  onClick={() => onRequestDelete(message.id)}
                  disabled={deleteDisabled}
                  style={iconButtonStyle}
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
    <section className="ct-lobby-chat-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="ct-chat-thread-box" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {onRunSearch && (
          <div style={{ padding: "10px 16px 0" }}>
            <Input
              allowClear
              size="small"
              value={searchQuery}
              placeholder="Bu lobide ara…"
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
          ref={messagesContainerRef}
          className="ct-chat-messages" 
          style={{ flex: 1, overflowY: "auto", padding: "16px" }}
        >
          <div className="ct-scroll-indicator top" />

          {lobbyMessagesQuery.isPending && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", flexDirection: "column", gap: "10px", padding: "40px 0" }}>
              <Spin size="small" />
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Sohbet yükleniyor...</span>
            </div>
          )}

          {!lobbyMessagesQuery.isPending && lobbyMessagesQuery.isError && (
            <div style={{ padding: "8px 16px" }}>
              <Alert
                message="Hata"
                description={`Sohbet alınamadı: ${lobbyMessagesQuery.error.message}`}
                type="error"
                showIcon
                style={{
                  background: "rgba(255, 77, 79, 0.05)",
                  border: "1px solid rgba(255, 77, 79, 0.15)",
                  color: "#ff4d4f"
                }}
              />
            </div>
          )}

          {!lobbyMessagesQuery.isPending &&
            !lobbyMessagesQuery.isError &&
            !lobbyMessagesQuery.data?.ok && (
              <div style={{ padding: "8px 16px" }}>
                <Alert
                  message="Hata"
                  description={`Sohbet alınamadı: ${getApiErrorMessage(lobbyMessagesQuery.data?.error)}`}
                  type="error"
                  showIcon
                  style={{
                    background: "rgba(255, 77, 79, 0.05)",
                    border: "1px solid rgba(255, 77, 79, 0.15)",
                    color: "#ff4d4f"
                  }}
                />
              </div>
            )}

          {searchResults === null && showEmptyState && (
            <div className="ct-list-state ct-chat-empty-state" style={{ padding: "32px 16px", textAlign: "center" }}>
              <p className="text-xs text-[#5f5f5f]">Bu lobide henüz mesaj yok. İlk mesajı sen gönder!</p>
            </div>
          )}

          {searchResults !== null && (
            <div className="ct-chat-message-list">
              <div
                style={{
                  padding: "6px 4px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                }}
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

        <div className="ct-chat-composer" style={{ padding: "12px 16px", background: "transparent" }}>
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
                  icon={<SendOutlined style={{ color: lobbyMessageDraft.trim() || pendingAttachment ? "#ffffff" : "rgba(255,255,255,0.2)" }} />}
                  onClick={onSendLobbyMessage}
                  loading={isSendingLobbyMessage}
                  disabled={
                    isSendingLobbyMessage ||
                    (!lobbyMessageDraft.trim() && !pendingAttachment)
                  }
                  style={{ background: "transparent", border: "none" }}
                />
              }
              style={{
                flex: 1,
                background: "rgba(12, 12, 12, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "8px",
                padding: "6px 12px",
              }}
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


