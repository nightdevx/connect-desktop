import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Copy,
  Loader2,
  SendHorizontal,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { UserDirectoryEntry } from "../../../../../shared/auth-contracts";
import type { UseDirectMessagesResult } from "../hooks/use-direct-messages";
import {
  formatDateLabel,
  formatTimeLabel,
  getApiErrorMessage,
  getDisplayInitials,
  getUserStatusLabel,
} from "../workspace-utils";
import { ConfirmActionModal } from "./confirm-action-modal";

interface UsersDirectMessagesPanelProps {
  currentUserId: string;
  selectedUser: UserDirectoryEntry | null;
  onCopyUsername: (username: string) => Promise<void>;
  directMessagesQuery: UseDirectMessagesResult["directMessagesQuery"];
  directMessages: UseDirectMessagesResult["directMessages"];
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  onSendMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  deletingMessageId: string | null;
  isSendingMessage: boolean;
}

export function UsersDirectMessagesPanel({
  currentUserId,
  selectedUser,
  onCopyUsername,
  directMessagesQuery,
  directMessages,
  messageDraft,
  onMessageDraftChange,
  onSendMessage,
  onDeleteMessage,
  deletingMessageId,
  isSendingMessage,
}: UsersDirectMessagesPanelProps) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [isUserPopupOpen, setIsUserPopupOpen] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<
    string | null
  >(null);

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

  return (
    <article className="ct-chat-panel ct-chat-panel-plain">
      {selectedUser ? (
        <>
          <button
            type="button"
            className="ct-chat-user-header"
            onClick={() => setIsUserPopupOpen(true)}
          >
            <div className="ct-chat-user-header-left">
              <div className="ct-user-avatar lg" aria-hidden="true">
                {selectedUser.avatarUrl ? (
                  <img
                    className="ct-user-avatar-image"
                    src={selectedUser.avatarUrl}
                    alt=""
                  />
                ) : (
                  <span className="ct-user-avatar-fallback">
                    {getDisplayInitials(
                      selectedUser.displayName || selectedUser.username,
                    )}
                  </span>
                )}
              </div>

              <div className="ct-chat-user-header-main">
                <h3>{selectedUser.displayName || selectedUser.username}</h3>
                <span>@{selectedUser.username}</span>
              </div>
            </div>

            <div className="ct-chat-user-status">
              <span
                className={`ct-presence-dot ${selectedUser.appOnline ? "online" : "offline"}`}
                aria-hidden="true"
              />
              <span>{getUserStatusLabel(selectedUser.appOnline)}</span>
            </div>
          </button>

          <div className="ct-chat-thread-box">
            <div
              className={`ct-chat-messages ${showEmptyState ? "empty" : ""}`}
              ref={chatScrollRef}
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

              {showEmptyState && (
                <div className="ct-list-state ct-chat-empty-state">
                  Bu kişiyle henüz mesajlaşma yok. İlk mesajı sen gönder.
                </div>
              )}

              {!showEmptyState && (
                <div className="ct-chat-message-list">
                  {directMessages.map((message) => {
                    const own = message.userId === currentUserId;
                    const isDeleting = deletingMessageId === message.id;

                    return (
                      <div
                        key={message.id}
                        className={`ct-chat-row ${own ? "own" : ""}`}
                      >
                        <div className={`ct-chat-bubble ${own ? "own" : ""}`}>
                          <p>{message.body}</p>
                          <div className="ct-chat-bubble-meta">
                            <span>
                              {own
                                ? "Sen"
                                : selectedUser.displayName ||
                                  selectedUser.username}{" "}
                              • {formatTimeLabel(message.createdAt)}
                            </span>

                            {own && (
                              <button
                                type="button"
                                className="ct-chat-message-delete"
                                onClick={() =>
                                  setPendingDeleteMessageId(message.id)
                                }
                                disabled={Boolean(deletingMessageId)}
                                aria-label="Mesajı sil"
                                title={
                                  isDeleting ? "Mesaj siliniyor" : "Mesajı sil"
                                }
                              >
                                {isDeleting ? (
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
              )}
            </div>

            <div className="ct-chat-composer">
              <input
                type="text"
                className="ct-input"
                placeholder="Mesaj yaz..."
                value={messageDraft}
                onChange={(event) => onMessageDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSendMessage();
                  }
                }}
                disabled={isSendingMessage}
              />
              <button
                type="button"
                className="ct-chat-send-icon"
                onClick={onSendMessage}
                disabled={isSendingMessage || !messageDraft.trim()}
                aria-label="Mesaj gönder"
              >
                {isSendingMessage ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <SendHorizontal size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {isUserPopupOpen && (
            <div
              className="ct-user-popup-overlay"
              role="presentation"
              onClick={() => setIsUserPopupOpen(false)}
            >
              <section
                className="ct-user-popup"
                role="dialog"
                aria-modal="true"
                aria-label="Kullanıcı detayları"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="ct-user-popup-header">
                  <div className="ct-user-popup-title-row">
                    <div className="ct-user-avatar" aria-hidden="true">
                      {selectedUser.avatarUrl ? (
                        <img
                          className="ct-user-avatar-image"
                          src={selectedUser.avatarUrl}
                          alt=""
                        />
                      ) : (
                        <span className="ct-user-avatar-fallback">
                          {getDisplayInitials(
                            selectedUser.displayName || selectedUser.username,
                          )}
                        </span>
                      )}
                    </div>

                    <h4>{selectedUser.displayName || selectedUser.username}</h4>
                  </div>

                  <button
                    type="button"
                    className="ct-user-popup-close"
                    onClick={() => setIsUserPopupOpen(false)}
                    aria-label="Detay penceresini kapat"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>

                <div className="ct-detail-grid compact">
                  <div className="ct-detail-item">
                    <UserRound size={15} aria-hidden="true" />
                    <span>@{selectedUser.username}</span>
                  </div>
                  <div className="ct-detail-item">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>
                      Rol: {selectedUser.role === "admin" ? "Yönetici" : "Üye"}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    <CalendarDays size={15} aria-hidden="true" />
                    <span>
                      Kayıt: {formatDateLabel(selectedUser.createdAt)}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    {selectedUser.appOnline ? (
                      <Wifi size={15} aria-hidden="true" />
                    ) : (
                      <WifiOff size={15} aria-hidden="true" />
                    )}
                    <span>{getUserStatusLabel(selectedUser.appOnline)}</span>
                  </div>
                </div>

                <div className="ct-action-row">
                  <button
                    type="button"
                    className="ct-btn-secondary"
                    onClick={() => void onCopyUsername(selectedUser.username)}
                  >
                    <Copy size={15} aria-hidden="true" />
                    Kullanıcı Adını Kopyala
                  </button>
                </div>
              </section>
            </div>
          )}

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
        <p>Direkt mesajları görmek için soldan bir kullanıcı seç.</p>
      )}
    </article>
  );
}
