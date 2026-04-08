import { useState } from "react";
import { Loader2, SendHorizontal, Trash2 } from "lucide-react";
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

  return (
    <section className="ct-lobby-chat-panel">
      <div className="ct-chat-thread-box">
        <div className="ct-chat-messages">
          {lobbyMessagesQuery.isPending && (
            <div className="ct-list-state">Sohbet yükleniyor...</div>
          )}

          {!lobbyMessagesQuery.isPending && lobbyMessagesQuery.isError && (
            <div className="ct-list-state error">
              Sohbet alınamadı: {lobbyMessagesQuery.error.message}
            </div>
          )}

          {!lobbyMessagesQuery.isPending &&
            !lobbyMessagesQuery.isError &&
            !lobbyMessagesQuery.data?.ok && (
              <div className="ct-list-state error">
                Sohbet alınamadı:{" "}
                {getApiErrorMessage(lobbyMessagesQuery.data?.error)}
              </div>
            )}

          {!lobbyMessagesQuery.isPending &&
            !lobbyMessagesQuery.isError &&
            lobbyMessagesQuery.data?.ok &&
            lobbyMessages.length === 0 && (
              <div className="ct-list-state">Bu lobide henüz mesaj yok.</div>
            )}

          {lobbyMessages.map((message) => {
            const isOwnMessage = message.userId === currentUserId;
            const isDeletingMessage = deletingLobbyMessageId === message.id;

            return (
              <div
                key={message.id}
                className={`ct-chat-row ${isOwnMessage ? "own" : ""}`}
              >
                <div className={`ct-chat-bubble ${isOwnMessage ? "own" : ""}`}>
                  <p>{message.body}</p>
                  <div className="ct-chat-bubble-meta">
                    <span>
                      {message.username} - {formatTimeLabel(message.createdAt)}
                    </span>

                    {isOwnMessage && (
                      <button
                        type="button"
                        className="ct-chat-message-delete"
                        onClick={() => setPendingDeleteMessageId(message.id)}
                        disabled={Boolean(deletingLobbyMessageId)}
                        aria-label="Mesajı sil"
                        title={
                          isDeletingMessage ? "Mesaj siliniyor" : "Mesajı sil"
                        }
                      >
                        {isDeletingMessage ? (
                          <Loader2
                            size={12}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 size={12} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="ct-chat-composer">
          <input
            type="text"
            className="ct-input"
            placeholder="Lobiye mesaj yaz..."
            value={lobbyMessageDraft}
            onChange={(event) => setLobbyMessageDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendLobbyMessage();
              }
            }}
            disabled={isSendingLobbyMessage}
          />

          <button
            type="button"
            className="ct-chat-send-icon"
            onClick={onSendLobbyMessage}
            disabled={isSendingLobbyMessage || !lobbyMessageDraft.trim()}
            aria-label="Lobi mesajı gönder"
          >
            {isSendingLobbyMessage ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal size={15} aria-hidden="true" />
            )}
          </button>
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
