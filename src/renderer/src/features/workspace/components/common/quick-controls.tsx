import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Tooltip } from "antd";
import { Headphones, Mic, PlugZap } from "lucide-react";
import { getDisplayInitials } from "../../workspace-utils";

import { AudioDeviceDropdown } from "./AudioDeviceDropdown";

interface QuickControlsProps {
  currentUsername: string;
  currentUserAvatarUrl?: string | null;
  hasActiveLobby: boolean;
  isLeavingLobby: boolean;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
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
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
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
            >
              <Mic size={14} aria-hidden="true" />
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
            >
              <Headphones size={14} aria-hidden="true" />
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
              <PlugZap size={14} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}


