import { Dropdown, Menu } from "antd";
import type { MenuProps } from "antd";
import type { ReactNode } from "react";

interface AudioDeviceDropdownProps {
  children: ReactNode;
  kind: "input" | "output";
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}

export function AudioDeviceDropdown({
  children,
  kind,
  devices,
  selectedDeviceId,
  onSelectDevice,
}: AudioDeviceDropdownProps) {
  const isInput = kind === "input";

  const menuItems: MenuProps["items"] = [
    {
      key: "ct-selection-default",
      label: "Varsayılan Cihaz",
      onClick: () => onSelectDevice(null),
      className: selectedDeviceId === null ? "ct-device-menu-item-active" : "",
    },
    {
      type: "divider",
    },
    ...devices.map((device, index) => ({
      key: `ct-device-${device.deviceId || index}`,
      label: device.label || `${isInput ? "Mikrofon" : "Hoparlör"} ${index + 1}`,
      onClick: () => onSelectDevice(device.deviceId),
      className: selectedDeviceId === device.deviceId ? "ct-device-menu-item-active" : "",
    })),
  ];

  if (devices.length === 0 && !selectedDeviceId) {
    menuItems.push({
      key: "empty",
      label: "Cihaz bulunamadı",
      disabled: true,
    });
  }

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={["contextMenu"]}
      placement="topRight"
      overlayClassName="ct-audio-device-dropdown"
    >
      {children}
    </Dropdown>
  );
}
