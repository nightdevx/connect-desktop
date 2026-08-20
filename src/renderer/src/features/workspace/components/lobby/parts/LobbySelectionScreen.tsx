import { Button, Tooltip } from "antd";
import {
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
        <section className="ct-lobby-selection-rooms">
          <h3>
            Aktif Odalar
            <span className="ct-lobby-selection-count">{lobbiesCount}</span>
          </h3>

          <ul className="ct-lobby-selection-grid">
            {lobbies.map((lobby) => {
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
                  </div>

                  {/* Nobody is ever "in" a message room, so an occupancy count
                      there would always read 0 and a "Katıl" button would
                      promise a connection this click does not make. */}
                  <span className="ct-lobby-select-card-meta">
                    {lobby.isTextOnly ? (
                      "Sohbet kanalı"
                    ) : (
                      <>
                        <TeamOutlined />
                        {lobby.memberCount} kişi
                      </>
                    )}
                  </span>

                  <Button
                    className="ct-lobby-select-card-action"
                    onClick={() => onJoinLobby(lobby.id)}
                    disabled={joiningLobbyId !== null}
                    icon={isJoining ? <LoadingOutlined /> : undefined}
                  >
                    {isJoining ? "Katılıyor…" : lobby.isTextOnly ? "Aç" : "Katıl"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
