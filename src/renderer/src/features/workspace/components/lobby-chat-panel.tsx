import { useState } from "react";
import { Input, Button, Tooltip, Spin, Alert } from "antd";
import { SendOutlined, DeleteOutlined } from "@ant-design/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "../../../../../shared/auth-contracts";
import type { DesktopResult } from "../../../../../shared/desktop-api-types";
import { ConfirmActionModal } from "./confirm-action-modal";
import { formatTimeLabel, getApiErrorMessage } from "../workspace-utils";

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
}: LobbyChatPanelProps) {
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<
    string | null
  >(null);

  const showEmptyState =
    !lobbyMessagesQuery.isPending &&
    !lobbyMessagesQuery.isError &&
    Boolean(lobbyMessagesQuery.data?.ok) &&
    lobbyMessages.length === 0;

  return (
    <section className="ct-lobby-chat-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="ct-chat-thread-box" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="ct-chat-messages" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
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

          {showEmptyState && (
            <div className="ct-list-state ct-chat-empty-state" style={{ padding: "32px 16px", textAlign: "center" }}>
              <p className="text-xs text-[#5f5f5f]">Bu lobide henüz mesaj yok. İlk mesajı sen gönder!</p>
            </div>
          )}

          {!showEmptyState && (
            <div className="ct-chat-message-list">
              {lobbyMessages.map((message) => {
                const isOwnMessage = message.userId === currentUserId;
                const isDeletingMessage = deletingLobbyMessageId === message.id;

                return (
                  <div
                    key={message.id}
                    className={`ct-chat-row ${isOwnMessage ? "own" : ""}`}
                  >
                    <div className={`ct-chat-bubble ${isOwnMessage ? "own" : ""}`}>
                      <p style={{ margin: 0, wordBreak: "break-word" }}>{message.body}</p>
                      <div className="ct-chat-bubble-meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                        <span style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.35)" }}>
                          {message.username} • {formatTimeLabel(message.createdAt)}
                        </span>

                        {isOwnMessage && (
                          <Tooltip title="Mesajı Sil">
                            <Button
                              type="text"
                              shape="circle"
                              size="small"
                              danger
                              icon={isDeletingMessage ? <Spin size="small" /> : <DeleteOutlined style={{ fontSize: "11px" }} />}
                              onClick={() => setPendingDeleteMessageId(message.id)}
                              disabled={Boolean(deletingLobbyMessageId)}
                              style={{
                                width: "20px",
                                height: "20px",
                                minWidth: "20px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "rgba(255,255,255,0.45)",
                                border: "none",
                                background: "transparent"
                              }}
                            />
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="ct-chat-composer" style={{ padding: "12px 16px", background: "transparent" }}>
          <Input
            placeholder="Lobiye mesaj yaz..."
            value={lobbyMessageDraft}
            onChange={(event) => setLobbyMessageDraft(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey && lobbyMessageDraft.trim()) {
                event.preventDefault();
                onSendLobbyMessage();
              }
            }}
            disabled={isSendingLobbyMessage}
            suffix={
              <Button
                type="text"
                icon={<SendOutlined style={{ color: lobbyMessageDraft.trim() ? "#ffffff" : "rgba(255,255,255,0.2)" }} />}
                onClick={onSendLobbyMessage}
                loading={isSendingLobbyMessage}
                disabled={isSendingLobbyMessage || !lobbyMessageDraft.trim()}
                style={{ background: "transparent", border: "none" }}
              />
            }
            style={{
              background: "rgba(12, 12, 12, 0.8)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              color: "#f5f5f5",
              borderRadius: "8px",
              padding: "6px 12px",
            }}
          />
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
