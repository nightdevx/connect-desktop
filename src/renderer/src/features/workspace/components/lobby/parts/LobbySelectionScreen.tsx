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
      className={`ct-content-card ct-lobby-main-layer selection flex flex-col justify-between p-6 ${activeLobbyId ? "hidden-layer" : ""}`}
    >
      <div className="flex flex-col items-center justify-center text-center py-16" >
        <ExclamationCircleOutlined className="ct-list-state-icon" />
        <h3 className="text-base font-semibold text-white mb-2">Lobi Odası Seç</h3>
        <p className="text-xs text-[#8f8f8f] max-w-[340px] mb-8">
          Katılmak istediğin lobi odasını seçerek diğer kullanıcılarla sesli, görüntülü veya yazılı iletişime geçebilirsin.
        </p>
      </div>

      <div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Aktif Odalar ({lobbiesCount})
        </p>
        <ul className="ct-list flex flex-col gap-2">
          {lobbies.map((lobby) => (
            <li
              key={lobby.id}
              className="ct-list-item clickable ct-lobby-select-card flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-white"># {lobby.name}</p>
                <span className="text-xs text-zinc-500">{lobby.memberCount} üye aktif</span>
              </div>
              <Button
                type="default"
                onClick={() => onJoinLobby(lobby.id)}
                disabled={joiningLobbyId !== null}
                
              >
                {joiningLobbyId === lobby.id ? <LoadingOutlined /> : "Katıl"}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
