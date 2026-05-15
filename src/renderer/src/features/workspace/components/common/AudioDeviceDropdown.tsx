import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useState, type ReactNode } from "react";

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
  const [open, setOpen] = useState(false);
  const isInput = kind === "input";

  const handleSelect = (deviceId: string | null) => {
    onSelectDevice(deviceId);
    setOpen(false);
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "ct-selection-default",
      label: "Varsayılan Cihaz",
      onClick: () => handleSelect(null),
      className: selectedDeviceId === null ? "ct-device-menu-item-active" : "",
    },
    {
      type: "divider",
    },
    ...devices.map((device, index) => ({
      key: `ct-device-${device.deviceId || index}`,
      label: device.label || `${isInput ? "Mikrofon" : "Hoparlör"} ${index + 1}`,
      onClick: () => handleSelect(device.deviceId),
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
      open={open}
      onOpenChange={setOpen}
    >
      {children}
    </Dropdown>
  );
}
