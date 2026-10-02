import { Tooltip } from "antd";
import {
  KeyOutlined,
  LockOutlined,
  MessageOutlined,
  SoundOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import { ElapsedTime } from "../../common/elapsed-time";

interface LobbyRoomHeaderProps {
  lobby: LobbyDescriptor | null;
  /** People in the voice room. Meaningless for a text room, which nobody joins. */
  memberCount: number;
  /** Voice-connected to THIS room, as opposed to merely reading it. */
  isConnected: boolean;
  /** When this user joined the room, from the server's roster. */
  connectedSince?: string | null;
  /** People in the room sharing a screen right now. */
  liveShareCount?: number;
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
 * The chat toggle lives in the stage toolbar now, with every other control
 * for the room.
 */
export function LobbyRoomHeader({
  lobby,
  memberCount,
  isConnected,
  connectedSince,
  liveShareCount = 0,
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
          <span className={`ct-lobby-room-icon ${isTextOnly ? "" : "voice"}`}>
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

            {liveShareCount > 0 && (
              <span className="ct-live-chip" title="Bu odada ekran paylaşılıyor">
                <span className="ct-live-dot" aria-hidden="true" />
                {liveShareCount} yayın
              </span>
            )}
          </>
        )}
      </div>

      {!isTextOnly && (
        // Connected, it is how long you have been here -- the green dot
        // already says "connected".
        <span
          className={`ct-lobby-room-status ${isConnected ? "on" : ""} ${isConnected && connectedSince ? "timer" : ""}`}
          role="status"
          title={isConnected ? "Bağlı — odada geçen süre" : undefined}
        >
          <i aria-hidden="true" />
          {isConnected && connectedSince ? (
            <ElapsedTime since={connectedSince} />
          ) : isConnected ? (
            "Bağlı"
          ) : (
            "Bağlanıyor…"
          )}
        </span>
      )}

    </header>
  );
}
