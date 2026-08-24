import { Button, Tooltip } from "antd";
import {
  KeyOutlined,
  LoadingOutlined,
  LockOutlined,
  MessageOutlined,
  SoundOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";

interface LobbySelectionScreenProps {
  activeLobbyId: string | null;
  lobbiesCount: number;
  lobbies: LobbyDescriptor[];
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
}

/**
 * What the lobbies section shows before a room is open.
 *
 * It used to be a centred hero with a single-column list glued to the bottom of
 * it: 88px of air between the paragraph and the list heading, 2px between the
 * cards themselves, and one card stretched across a 1200px panel however many
 * rooms there were. The hero also repeated the workspace header directly above
 * it, so the screen opened with two titles saying the same thing.
 *
 * Now the title is the page's own (the workspace header is hidden for this
 * section), and the rooms are a grid that fills the width it is given. The hero
 * survives only for the case it was actually written for: no rooms at all.
 */
export function LobbySelectionScreen({
  activeLobbyId,
  lobbiesCount,
  lobbies,
  joiningLobbyId,
  onJoinLobby,
}: LobbySelectionScreenProps) {
  // Split rather than filtered in place: the two are different objects to the
  // user — one is a room you join, the other a channel you open — and mixing
  // them in one grid was the whole of "the text rooms look like lobbies".
  const voiceLobbies = lobbies.filter((lobby) => !lobby.isTextOnly);
  const textRooms = lobbies.filter((lobby) => lobby.isTextOnly);

  return (
    <article
      className={`ct-lobby-main-layer selection ct-lobby-selection ${activeLobbyId ? "hidden-layer" : ""}`}
    >
      <header className="ct-lobby-selection-head">
        <h2>Lobiler</h2>
        <p>
          Bir odaya katılarak sesli, görüntülü veya yazılı olarak sohbet
          edebilirsin.
        </p>
      </header>

      {lobbiesCount === 0 ? (
        <div className="ct-lobby-selection-empty">
          <TeamOutlined />
          <h3>Henüz oda yok</h3>
          <p>
            Kenar çubuğundaki + düğmesiyle ilk lobiyi oluştur; herkes buradan
            katılabilir.
          </p>
        </div>
      ) : (
        <>
        <section className="ct-lobby-selection-rooms">
          <h3>
            Sesli Odalar
            <span className="ct-lobby-selection-count">{voiceLobbies.length}</span>
          </h3>

          {voiceLobbies.length === 0 && (
            <p className="ct-lobby-selection-none">Açık sesli oda yok.</p>
          )}

          <ul className="ct-lobby-selection-grid">
            {voiceLobbies.map((lobby) => {
              const isJoining = joiningLobbyId === lobby.id;

              return (
                <li key={lobby.id} className="ct-lobby-select-card">
                  <div className="ct-lobby-select-card-head">
                    {/* Kind first, in the slot the "#" used to hold. */}
                    <Tooltip
                      title={
                        lobby.isTextOnly
                          ? "Mesaj odası — sesli bağlantı yok"
                          : "Sesli lobi"
                      }
                    >
                      <span className="ct-lobby-select-card-icon">
                        {lobby.isTextOnly ? (
                          <MessageOutlined />
                        ) : (
                          <SoundOutlined />
                        )}
                      </span>
                    </Tooltip>

                    <strong title={lobby.name}>{lobby.name}</strong>

                    {lobby.isLocked && (
                      <Tooltip title="Bu lobi kilitlidir">
                        <LockOutlined className="ct-lobby-select-card-flag warn" />
                      </Tooltip>
                    )}

                    {/* A password was invisible everywhere until now: a
                        protected room drew exactly like an open one and you
                        only learned about it from the prompt after clicking. */}
                    {lobby.hasPassword && (
                      <Tooltip title="Şifre korumalı oda">
                        <KeyOutlined className="ct-lobby-select-card-flag warn" />
                      </Tooltip>
                    )}
                  </div>

                  <span className="ct-lobby-select-card-meta">
                    <TeamOutlined />
                    {lobby.capacity
                      ? `${lobby.memberCount} / ${lobby.capacity} kişi`
                      : `${lobby.memberCount} kişi`}
                  </span>

                  <Button
                    className="ct-lobby-select-card-action"
                    onClick={() => onJoinLobby(lobby.id)}
                    disabled={joiningLobbyId !== null}
                    icon={isJoining ? <LoadingOutlined /> : undefined}
                  >
                    {isJoining ? "Katılıyor…" : "Katıl"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Text rooms are not lobbies with the sound turned off.

            Nobody is ever "in" one, there is nothing to join and no occupancy to
            report, so drawing them as room cards promised a connection the click
            does not make and left a "0 kişi" that could never be anything else.
            They read as what they are: a list of channels you open. */}
        {textRooms.length > 0 && (
          <section className="ct-lobby-selection-rooms">
            <h3>
              Yazılı Sohbetler
              <span className="ct-lobby-selection-count">{textRooms.length}</span>
            </h3>

            <ul className="ct-lobby-channel-list">
              {textRooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className="ct-lobby-channel"
                    onClick={() => onJoinLobby(room.id)}
                  >
                    <span className="ct-lobby-channel-hash" aria-hidden="true">
                      #
                    </span>
                    <span className="ct-lobby-channel-name" title={room.name}>
                      {room.name}
                    </span>

                    {room.isLocked && (
                      <Tooltip title="Yalnızca izin verilenler görebilir">
                        <LockOutlined className="ct-lobby-channel-flag" />
                      </Tooltip>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        </>
      )}
    </article>
  );
}
