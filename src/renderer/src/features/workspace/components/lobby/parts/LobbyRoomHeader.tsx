import { Tooltip } from "antd";
import {
  KeyOutlined,
  LockOutlined,
  MessageOutlined,
  RightOutlined,
  LeftOutlined,
  SoundOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";

interface LobbyRoomHeaderProps {
  lobby: LobbyDescriptor | null;
  /** People in the voice room. Meaningless for a text room, which nobody joins. */
  memberCount: number;
  /** Voice-connected to THIS room, as opposed to merely reading it. */
  isConnected: boolean;
  isChatOpen: boolean;
  unreadCount: number;
  onToggleChat: () => void;
}

/**
 * The room's identity bar.
 *
 * There used to be nothing here at all: the workspace header is hidden while a
 * lobby is open, so the room's name, its lock, how many people are in it and
 * whether the microphone is actually connected appeared nowhere in the main
 * panel — the only clue was which row happened to be highlighted in the
 * sidebar. A text room was worse still: it renders no stage, so it had no
 * chrome of its own whatsoever.
 *
 * It also takes over the chat toggle, which used to be a pill floating over the
 * top-right corner of the video area.
 */
export function LobbyRoomHeader({
  lobby,
  memberCount,
  isConnected,
  isChatOpen,
  unreadCount,
  onToggleChat,
}: LobbyRoomHeaderProps) {
  if (!lobby) {
    return null;
  }

  const isTextOnly = Boolean(lobby.isTextOnly);

  return (
    <header className="ct-lobby-room-header">
      <div className="ct-lobby-room-identity">
        {/* The room's kind, where the "#" used to be: a speaker for voice, a
            chat bubble for a message room. */}
        <Tooltip
          title={
            isTextOnly ? "Mesaj odası — sesli bağlantı yok" : "Sesli lobi"
          }
        >
          <span className="ct-lobby-room-icon">
            {isTextOnly ? <MessageOutlined /> : <SoundOutlined />}
          </span>
        </Tooltip>

        <h2 className="ct-lobby-room-name" title={lobby.name}>
          {lobby.name}
        </h2>

        {lobby.isLocked && (
          <Tooltip title="Bu lobi kilitlidir">
            <LockOutlined className="ct-lobby-room-flag warn" />
          </Tooltip>
        )}

        {lobby.hasPassword && (
          <Tooltip title="Şifre korumalı oda">
            <KeyOutlined className="ct-lobby-room-flag warn" />
          </Tooltip>
        )}
      </div>

      <div className="ct-lobby-room-meta">
        {isTextOnly ? (
          <span className="ct-lobby-room-meta-item">Mesaj odası</span>
        ) : (
          <>
            <span
              className="ct-lobby-room-meta-item"
              title={lobby.capacity ? "Üye sayısı / kapasite" : "Üye sayısı"}
            >
              <TeamOutlined />
              {lobby.capacity ? `${memberCount} / ${lobby.capacity}` : memberCount}
            </span>

            <span
              className={`ct-lobby-room-status ${isConnected ? "on" : ""}`}
              role="status"
            >
              <i aria-hidden="true" />
              {isConnected ? "Bağlı" : "Bağlanıyor…"}
            </span>
          </>
        )}
      </div>

      {/* A text room IS its chat, so there is nothing to toggle it against. */}
      {!isTextOnly && (
        <button
          type="button"
          className={`ct-lobby-room-action ${isChatOpen ? "on" : ""}`}
          onClick={onToggleChat}
          aria-pressed={isChatOpen}
        >
          {isChatOpen ? <RightOutlined /> : <LeftOutlined />}
          {/* Its own class, because the narrow layout drops the label and
              keeps the count — and "> span" would have hidden both. */}
          <span className="ct-lobby-room-action-label">
            {isChatOpen ? "Sohbeti Kapat" : "Sohbeti Aç"}
          </span>

          {/* The one place a message can arrive with the chat right there and
              still be invisible: the column is collapsed. */}
          {!isChatOpen && unreadCount > 0 && (
            <span className="ct-lobby-unread">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}
    </header>
  );
}
