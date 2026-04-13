import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Headphones, Mic, PlugZap } from "lucide-react";
import { getDisplayInitials } from "../workspace-utils";

type DeviceMenuKind = "input" | "output";

interface DeviceMenuState {
  kind: DeviceMenuKind;
  x: number;
  y: number;
}

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
  const [deviceMenu, setDeviceMenu] = useState<DeviceMenuState | null>(null);
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deviceMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!deviceMenuRef.current) {
        return;
      }

      if (!deviceMenuRef.current.contains(event.target as Node)) {
        setDeviceMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setDeviceMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deviceMenu]);

  const openDeviceMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    kind: DeviceMenuKind,
  ): void => {
    event.preventDefault();
    setDeviceMenu({
      kind,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const renderDeviceOptions = (): ReactNode => {
    if (!deviceMenu) {
      return null;
    }

    const isInput = deviceMenu.kind === "input";
    const devices = isInput ? audioInputDevices : audioOutputDevices;
    const selectedId = isInput
      ? selectedAudioInputDeviceId
      : selectedAudioOutputDeviceId;

    return (
      <div
        ref={deviceMenuRef}
        className="ct-quick-device-menu"
        style={{ left: deviceMenu.x, top: deviceMenu.y }}
        role="menu"
        aria-label={
          isInput ? "Mikrofon giriş cihazı seç" : "Ses çıkış cihazı seç"
        }
      >
        <header className="ct-quick-device-menu-header">
          {isInput ? "Mikrofon Girişi" : "Ses Çıkışı"}
        </header>

        <button
          type="button"
          className={`ct-quick-device-menu-item ${selectedId === null ? "active" : ""}`}
          onClick={() => {
            if (isInput) {
              onSelectAudioInputDevice(null);
            } else {
              onSelectAudioOutputDevice(null);
            }
            setDeviceMenu(null);
          }}
        >
          Varsayılan
        </button>

        {devices.length === 0 && (
          <div className="ct-quick-device-menu-empty">Cihaz bulunamadı</div>
        )}

        {devices.map((device, index) => {
          const deviceId = device.deviceId || null;
          const isActive = deviceId !== null && selectedId === deviceId;

          return (
            <button
              key={device.deviceId || `${device.kind}-${index}`}
              type="button"
              className={`ct-quick-device-menu-item ${isActive ? "active" : ""}`}
              onClick={() => {
                if (!deviceId) {
                  return;
                }

                if (isInput) {
                  onSelectAudioInputDevice(deviceId);
                } else {
                  onSelectAudioOutputDevice(deviceId);
                }
                setDeviceMenu(null);
              }}
            >
              {device.label || `${isInput ? "Mikrofon" : "Çıkış"} ${index + 1}`}
            </button>
          );
        })}
      </div>
    );
  };

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
          onContextMenu={(event) => {
            openDeviceMenu(event, "input");
          }}
          aria-label="Mikrofon"
          title={`Mikrofon ${micEnabled ? "açık" : "kapalı"} (sağ tık: giriş cihazı)`}
        >
          <Mic size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`ct-quick-icon-button ${headphoneEnabled ? "active" : ""}`}
          onClick={onToggleHeadphone}
          onContextMenu={(event) => {
            openDeviceMenu(event, "output");
          }}
          aria-label="Kulaklık"
          title={`Kulaklık ${headphoneEnabled ? "açık" : "kapalı"} (sağ tık: çıkış cihazı)`}
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

      {renderDeviceOptions()}
    </footer>
  );
}
