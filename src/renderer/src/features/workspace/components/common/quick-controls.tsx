import { Tooltip } from "antd";
import {
  AudioMutedOutlined,
  AudioOutlined,
  CustomerServiceOutlined,
  DisconnectOutlined,
  DesktopOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { getDisplayInitials } from "../../workspace-utils";

import { AudioDeviceDropdown } from "./AudioDeviceDropdown";

interface QuickControlsProps {
  currentUsername: string;
  currentUserAvatarUrl?: string | null;
  hasActiveLobby: boolean;
  isLeavingLobby: boolean;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  /** This user's own screen share, not somebody else's being watched. */
  screenShareEnabled: boolean;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onStopScreenShare: () => void;
  onDisconnect: () => void;
}

/**
 * The dock at the bottom of the sidebar column: who you are, your microphone
 * and output, the way out of a room, and a live share.
 *
 * Rendered by WorkspaceShell rather than by a sidebar, and that is the point.
 * It used to sit inside WorkspaceSidebar behind `workspaceSection !== "settings"`,
 * and the admin section replaces the sidebar outright -- so the two screens
 * where you are least likely to be watching the room were also the two where
 * your microphone state, and the button that gets you out, disappeared.
 */
export function QuickControls({
  currentUsername,
  currentUserAvatarUrl,
  hasActiveLobby,
  isLeavingLobby,
  micEnabled,
  headphoneEnabled,
  screenShareEnabled,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  onToggleMic,
  onToggleHeadphone,
  onStopScreenShare,
  onDisconnect,
}: QuickControlsProps) {
  return (
    <div className="ct-quick-dock">
      {/* Sits ABOVE the identity row on purpose: a share you have forgotten
          about is the one piece of state here with a privacy cost, so it gets
          its own box rather than a fourth icon in a row of icons. */}
      {screenShareEnabled && (
        <div className="ct-quick-share-bar" role="status" aria-live="polite">
          <span className="ct-quick-share-state">
            <DesktopOutlined aria-hidden="true" />
            Ekranınız paylaşılıyor
          </span>
          <Tooltip title="Yayını kapat">
            <button
              type="button"
              className="ct-quick-share-stop"
              onClick={onStopScreenShare}
              aria-label="Yayını kapat"
            >
              <StopOutlined />
            </button>
          </Tooltip>
        </div>
      )}

      <footer className="ct-quick-idle" aria-label="Hızlı kontroller">
      <div className="ct-quick-idle-left">
        <div className="ct-quick-idle-logo" aria-hidden="true">
          {currentUserAvatarUrl ? (
            <img
              className="ct-user-avatar-image"
              src={currentUserAvatarUrl}
              alt=""
            />
          ) : (
            getDisplayInitials(currentUsername)
          )}
        </div>
        <div className="ct-quick-idle-meta">
          <strong>{currentUsername}</strong>
          <span>{hasActiveLobby ? "Lobiye bağlı" : "Lobiye bağlı değil"}</span>
        </div>
      </div>

      <div className="ct-quick-controls-inline" aria-label="İşlevler">
        <AudioDeviceDropdown
          kind="input"
          devices={audioInputDevices}
          selectedDeviceId={selectedAudioInputDeviceId}
          onSelectDevice={onSelectAudioInputDevice}
        >
          <Tooltip
            title={`Mikrofon ${micEnabled ? "açık" : "kapalı"} (sağ tık: giriş cihazı)`}
          >
            <button
              type="button"
              className={`ct-quick-icon-button ${micEnabled ? "active" : ""}`}
              onClick={onToggleMic}
              aria-label="Mikrofon"
              aria-pressed={micEnabled}
            >
              {/* The icon carries the state as well as the colour, so it still
                  reads at a glance for anyone who cannot rely on the fill. */}
              {micEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            </button>
          </Tooltip>
        </AudioDeviceDropdown>

        <AudioDeviceDropdown
          kind="output"
          devices={audioOutputDevices}
          selectedDeviceId={selectedAudioOutputDeviceId}
          onSelectDevice={onSelectAudioOutputDevice}
        >
          <Tooltip
            title={`Kulaklık ${headphoneEnabled ? "açık" : "kapalı"} (sağ tık: çıkış cihazı)`}
          >
            <button
              type="button"
              className={`ct-quick-icon-button ${headphoneEnabled ? "active" : ""}`}
              onClick={onToggleHeadphone}
              aria-label="Kulaklık"
              aria-pressed={headphoneEnabled}
            >
              <CustomerServiceOutlined
                className={headphoneEnabled ? undefined : "ct-icon-slashed"}
              />
            </button>
          </Tooltip>
        </AudioDeviceDropdown>

          {hasActiveLobby && (
            <Tooltip
              title={isLeavingLobby ? "Lobiden ayrılıyor" : "Lobiden ayrıl"}
            >
              <button
                type="button"
                className="ct-quick-icon-button danger"
                onClick={onDisconnect}
                disabled={isLeavingLobby}
                aria-label="Lobiden ayrıl"
              >
                <DisconnectOutlined />
              </button>
            </Tooltip>
          )}
        </div>
      </footer>
    </div>
  );
}
