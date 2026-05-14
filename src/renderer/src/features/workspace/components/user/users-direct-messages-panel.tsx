import { useEffect, useRef, useState } from "react";
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
} from "@ant-design/icons";
import type { UserDirectoryEntry, ChatMessage } from "@shared/auth-contracts";
import type { UseDirectMessagesResult } from "../../hooks/chat/use-direct-messages";
import {
  formatDateLabel,
  formatTimeLabel,
  getApiErrorMessage,
  getDisplayInitials,
  getUserStatusLabel,
} from "../../workspace-utils";
import { ConfirmActionModal } from "../common";

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
                  <p className="text-sm text-[#8f8f8f] mb-1">Bu kişiyle henüz mesajlaşma yok.</p>
                  <p className="text-xs text-[#5f5f5f]">İlk mesajı göndermek için aşağıdaki yazma alanını kullanabilirsin.</p>
                </div>
              )}

              {!showEmptyState && (
                <div className="ct-chat-message-list">
                  {directMessages.map((message: ChatMessage) => {
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
                                  <div className="ct-spinner-small" />
                                ) : (
                                  <DeleteOutlined style={{ fontSize: "11px" }} />
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

            <div className="ct-chat-composer" style={{ padding: "16px", background: "transparent" }}>
              <Input
                size="large"
                placeholder="Mesaj yaz..."
                value={messageDraft}
                onChange={(event) => onMessageDraftChange(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey && messageDraft.trim()) {
                    event.preventDefault();
                    onSendMessage();
                  }
                }}
                disabled={isSendingMessage}
                suffix={
                  <Button
                    type="text"
                    icon={<SendOutlined style={{ color: messageDraft.trim() ? "#ffffff" : "rgba(255,255,255,0.2)" }} />}
                    onClick={onSendMessage}
                    loading={isSendingMessage}
                    disabled={isSendingMessage || !messageDraft.trim()}
                    style={{ background: "transparent", border: "none" }}
                  />
                }
                style={{
                  background: "rgba(12, 12, 12, 0.8)",
                  borderColor: "rgba(255, 255, 255, 0.08)",
                  color: "#f5f5f5",
                  borderRadius: "10px",
                  padding: "6px 12px",
                }}
              />
            </div>
          </div>

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
                  {getUserStatusLabel(selectedUser.appOnline)}
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
        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center bg-[rgba(5,5,5,0.2)]">
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


