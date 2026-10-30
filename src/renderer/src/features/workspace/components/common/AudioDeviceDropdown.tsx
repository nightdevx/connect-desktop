import { useState, type ReactNode } from "react";
import { useUiStore } from "@/store/ui-store";
import { MenuIcon, OdakMenu, type OdakMenuEntry } from "@/ui/odak-menu";

interface AudioDeviceDropdownProps {
  children: ReactNode;
  kind: "input" | "output";
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
  /** The control's own switch (the microphone, or the sound), offered in the
      menu with the hotkey the user bound to it. Left out where the control
      is only a status flag. */
  enabled?: boolean;
  onToggle?: () => void;
  /** Why the switch cannot be used now ("bir yetkili kapattı"). */
  toggleDisabled?: string;
}

// An Electron accelerator as it reads on the keys: "CommandOrControl+Shift+M"
// is Ctrl ⇧ M.
const acceleratorKeys = (accelerator: string): string[] =>
  accelerator
    .split("+")
    .filter(Boolean)
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part === "Shift" ? "⇧" : part));

// Chromium lists the system default as its own entry, named after the device
// it stands for ("Varsayılan - Mikrofon (Realtek)").
const defaultDeviceName = (devices: MediaDeviceInfo[]): string | undefined =>
  devices
    .find((device) => device.deviceId === "default")
    ?.label.replace(/^(default|varsayılan)\s*-\s*/i, "") || undefined;

/**
 * Right-click a microphone or headphone control to pick the device it uses.
 *
 * The app's one menu (OdakMenu), at the cursor like every other right-click
 * menu. It used to be a hand-written popover: no opening motion, no arrow keys,
 * and before that it was placed with CSS anchor positioning against an anchor
 * name every instance on screen declared at once, which resolved to none of
 * them and dropped it in the window's bottom-left corner.
 */
export function AudioDeviceDropdown({
  children,
  kind,
  devices,
  selectedDeviceId,
  onSelectDevice,
  enabled,
  onToggle,
  toggleDisabled,
}: AudioDeviceDropdownProps) {
  const isInput = kind === "input";
  const [hotkey, setHotkey] = useState("");
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);

  // The hotkey lives in the main process's preferences; read on each opening,
  // so one rebound in Ayarlar shows the next time.
  const handleOpenChange = (open: boolean): void => {
    if (!open || !onToggle) {
      return;
    }
    void window.desktopApi.getAppPreferences().then((result) => {
      const preferences = result.ok ? result.data?.preferences : undefined;
      if (preferences) {
        setHotkey(isInput ? preferences.hotkeyToggleMute : preferences.hotkeyToggleDeafen);
      }
    });
  };

  const defaultName = defaultDeviceName(devices);
  const items: OdakMenuEntry[] = [
    {
      type: "group",
      key: "devices",
      title: isInput ? "Giriş · mikrofon" : "Çıkış · kulaklık",
      items: [
        {
          key: "default",
          label: "Varsayılan",
          description: defaultName ? `Şu an: ${defaultName}` : undefined,
          checked: selectedDeviceId === null,
          onSelect: () => onSelectDevice(null),
        },
        ...devices.map(
          (device, index): OdakMenuEntry => ({
            key: `device-${device.deviceId || index}`,
            label: device.label || `${isInput ? "Mikrofon" : "Hoparlör"} ${index + 1}`,
            checked: selectedDeviceId === device.deviceId,
            onSelect: () => onSelectDevice(device.deviceId),
          }),
        ),
        devices.length === 0 &&
          !selectedDeviceId && {
            key: "empty",
            label: "Cihaz bulunamadı",
            disabled: true,
            onSelect: () => undefined,
          },
      ],
    },
    { type: "divider" },
    onToggle && {
      key: "toggle",
      icon: isInput ? (enabled ? "micOff" : "mic") : "headphones",
      label: isInput
        ? enabled
          ? "Mikrofonu kapat"
          : "Mikrofonu aç"
        : enabled
          ? "Kulaklığı kapat"
          : "Kulaklığı aç",
      shortcut: hotkey ? acceleratorKeys(hotkey) : undefined,
      disabled: toggleDisabled ?? false,
      onSelect: onToggle,
    },
    {
      key: "settings",
      icon: "sliders",
      label: "Ses ayarları",
      value: <MenuIcon name="external" size={14} />,
      onSelect: () => {
        setSettingsSection("audio");
        setWorkspaceSection("settings");
      },
    },
  ];

  return (
    <OdakMenu trigger="contextMenu" items={items} onOpenChange={handleOpenChange} width={280}>
      {/* The tile underneath opens its own participant menu on right-click,
          and the lobby row underneath that has one too. */}
      <div className="ct-audio-device-anchor" onContextMenu={(event) => event.stopPropagation()}>
        {children}
      </div>
    </OdakMenu>
  );
}
