import { Button } from "antd";
import { ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";

interface LobbySelectionScreenProps {
  activeLobbyId: string | null;
  lobbiesCount: number;
  lobbies: LobbyDescriptor[];
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
}

export function LobbySelectionScreen({
  activeLobbyId,
  lobbiesCount,
  lobbies,
  joiningLobbyId,
  onJoinLobby,
}: LobbySelectionScreenProps) {
  return (
    <article
      className={`ct-content-card ct-lobby-main-layer selection ct-lobby-selection ${activeLobbyId ? "hidden-layer" : ""}`}
    >
      <div className="ct-lobby-selection-hero">
        <ExclamationCircleOutlined className="ct-list-state-icon" />
        <h3>Lobi Odası Seç</h3>
        <p>
          Katılmak istediğin lobi odasını seçerek diğer kullanıcılarla sesli,
          görüntülü veya yazılı iletişime geçebilirsin.
        </p>
      </div>

      <div className="ct-lobby-selection-rooms">
        <h4>Aktif Odalar ({lobbiesCount})</h4>
        <ul className="ct-list">
          {lobbies.map((lobby) => (
            <li key={lobby.id} className="ct-lobby-select-card">
              <div className="min-w-0">
                <strong># {lobby.name}</strong>
                {/* Nobody is ever "in" a message room, so an occupancy count
                    there would always read 0 and a "Katıl" button would promise
                    a connection this click does not make. */}
                <span>
                  {lobby.isTextOnly
                    ? "Sohbet kanalı"
                    : `${lobby.memberCount} üye aktif`}
                </span>
              </div>
              <Button
                type="default"
                onClick={() => onJoinLobby(lobby.id)}
                disabled={joiningLobbyId !== null}
              >
                {joiningLobbyId === lobby.id ? (
                  <LoadingOutlined />
                ) : lobby.isTextOnly ? (
                  "Aç"
                ) : (
                  "Katıl"
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
