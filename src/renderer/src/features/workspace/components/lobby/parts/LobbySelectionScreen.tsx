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
      className="ct-content-card flex flex-col justify-between"
      style={{
        padding: "24px",
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        opacity: !activeLobbyId ? 1 : 0,
        transform: !activeLobbyId ? "translateY(0) scale(1)" : "translateY(-16px) scale(0.97)",
        pointerEvents: !activeLobbyId ? "auto" : "none",
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        visibility: !activeLobbyId ? "visible" : "hidden"
      }}
    >
      <div className="flex flex-col items-center justify-center text-center py-16" style={{ flex: 1 }}>
        <ExclamationCircleOutlined style={{ fontSize: "32px", color: "rgba(255,255,255,0.15)", marginBottom: "16px" }} />
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
              className="ct-list-item clickable flex items-center justify-between"
              style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)" }}
            >
              <div>
                <p className="text-sm font-semibold text-white"># {lobby.name}</p>
                <span className="text-xs text-zinc-500">{lobby.memberCount} üye aktif</span>
              </div>
              <Button
                type="default"
                onClick={() => onJoinLobby(lobby.id)}
                disabled={joiningLobbyId !== null}
                style={{
                  background: "#ffffff",
                  color: "#000000",
                  fontWeight: "600",
                  fontSize: "12px",
                  border: "none",
                  borderRadius: "6px",
                }}
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
