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
import type { FriendsController } from "../../hooks/user/use-friends";
import { UserProfileCardPopover } from "../user/user-profile-card";

import { AudioDeviceDropdown } from "./AudioDeviceDropdown";

interface QuickControlsProps {
  currentUsername: string;
  currentUserId: string;
  currentUserAvatarUrl?: string | null;
  /** Only so the card can render; nothing here acts on your own friends list. */
  friends: FriendsController;
  hasActiveLobby: boolean;
  isLeavingLobby: boolean;
  micEnabled: boolean;
  /**
   * A moderator took this user's microphone away.
   *
   * Disabled rather than flipped: micEnabled is what the person WANTS, it
   * survives the restriction, and the session republishes from it the moment the
   * mute lifts — which is what stopped a lifted mute needing a leave-and-rejoin.
   */
  micLocked: boolean;
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
  currentUserId,
  currentUserAvatarUrl,
  friends,
  hasActiveLobby,
  isLeavingLobby,
  micEnabled,
  micLocked,
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
      {/* Your own name was the only one in the app that was not clickable, so
          the card you can open for everybody else -- avatar, handle, join date
          -- was the one thing you could not check about yourself.

          Opens upward: the dock is pinned to the bottom of the window, and the
          card is taller than the space under it. */}
      <UserProfileCardPopover
        userId={currentUserId}
        fallbackName={currentUsername}
        currentUserId={currentUserId}
        friends={friends}
        placement="topLeft"
      >
        <button type="button" className="ct-quick-idle-left" aria-label="Profilin">
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
        </button>
      </UserProfileCardPopover>

      <div className="ct-quick-controls-inline" aria-label="İşlevler">
        <AudioDeviceDropdown
          kind="input"
          devices={audioInputDevices}
          selectedDeviceId={selectedAudioInputDeviceId}
          onSelectDevice={onSelectAudioInputDevice}
        >
          <Tooltip
            title={
              micLocked
                ? "Bir yetkili mikrofonunuzu kapattı (sağ tık: giriş cihazı)"
                : `Mikrofon ${micEnabled ? "açık" : "kapalı"} (sağ tık: giriş cihazı)`
            }
          >
            <button
              type="button"
              className={`ct-quick-icon-button ${micLocked ? "forced-muted" : micEnabled ? "active" : ""}`}
              onClick={onToggleMic}
              disabled={micLocked}
              // The reason rides on the label rather than a tooltip: a disabled
              // control gets no hover and no focus, so the tooltip is the one
              // place the explanation cannot be read from.
              aria-label={
                micLocked
                  ? "Mikrofon — bir yetkili mikrofonunuzu kapattı"
                  : "Mikrofon"
              }
              aria-pressed={micEnabled}
            >
              {/* The icon carries the state as well as the colour, so it still
                  reads at a glance for anyone who cannot rely on the fill. */}
              {micLocked || !micEnabled ? <AudioMutedOutlined /> : <AudioOutlined />}
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
