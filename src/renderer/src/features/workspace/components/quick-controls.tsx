import { Headphones, Mic, PlugZap } from "lucide-react";
import { getDisplayInitials } from "../workspace-utils";

interface QuickControlsProps {
  currentUsername: string;
  currentUserAvatarUrl?: string | null;
  hasActiveLobby: boolean;
  isLeavingLobby: boolean;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onDisconnect: () => void;
}

export function QuickControls({
  currentUsername,
  currentUserAvatarUrl,
  hasActiveLobby,
  isLeavingLobby,
  micEnabled,
  headphoneEnabled,
  onToggleMic,
  onToggleHeadphone,
  onDisconnect,
}: QuickControlsProps) {
  return (
    <footer className="ct-quick-idle" aria-label="Hızlı kontroller">
      <div className="ct-quick-idle-left">
        <div className="ct-user-avatar ct-quick-idle-logo" aria-hidden="true">
          {currentUserAvatarUrl ? (
            <img
              className="ct-user-avatar-image"
              src={currentUserAvatarUrl}
              alt=""
            />
          ) : (
            <span className="ct-user-avatar-fallback">
              {getDisplayInitials(currentUsername)}
            </span>
          )}
        </div>
        <div className="ct-quick-idle-meta">
          <strong>{currentUsername}</strong>
          <span>{hasActiveLobby ? "Lobiye bağlı" : "Lobiye bağlı değil"}</span>
        </div>
      </div>

      <div className="ct-quick-controls-inline" aria-label="İşlevler">
        <button
          type="button"
          className={`ct-quick-icon-button ${micEnabled ? "active" : ""}`}
          onClick={onToggleMic}
          aria-label="Mikrofon"
          title={`Mikrofon ${micEnabled ? "açık" : "kapalı"}`}
        >
          <Mic size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`ct-quick-icon-button ${headphoneEnabled ? "active" : ""}`}
          onClick={onToggleHeadphone}
          aria-label="Kulaklık"
          title={`Kulaklık ${headphoneEnabled ? "açık" : "kapalı"}`}
        >
          <Headphones size={14} aria-hidden="true" />
        </button>

        {hasActiveLobby && (
          <button
            type="button"
            className="ct-quick-icon-button danger"
            onClick={onDisconnect}
            disabled={isLeavingLobby}
            aria-label="Lobiden ayrıl"
            title={isLeavingLobby ? "Lobiden ayrılıyor" : "Lobiden ayrıl"}
          >
            <PlugZap size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </footer>
  );
}
