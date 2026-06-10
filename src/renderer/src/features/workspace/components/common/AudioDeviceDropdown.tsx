import { useState, useRef, useEffect, type ReactNode } from "react";

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
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInput = kind === "input";

  const handleSelect = (deviceId: string | null) => {
    onSelectDevice(deviceId);
    if (popoverRef.current) {
      try {
        popoverRef.current.hidePopover();
      } catch (err) {
        // Fallback if already closed or not supported
      }
    }
    setOpen(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  };

  useEffect(() => {
    if (open && popoverRef.current) {
      try {
        popoverRef.current.showPopover();
      } catch (err) {
        console.error("showPopover failed:", err);
      }
    }
  }, [open]);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const handleToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      if (toggleEvent.newState === "closed") {
        setOpen(false);
      }
    };

    popover.addEventListener("toggle", handleToggle);
    return () => {
      popover.removeEventListener("toggle", handleToggle);
    };
  }, [open]);

  const anchorName = kind === "input" ? "--audio-device-anchor-input" : "--audio-device-anchor-output";

  return (
    <div
      style={{ anchorName, display: "inline-block" } as any}
      onContextMenu={handleContextMenu}
    >
      {children}
      {open && (
        <div
          {...{ popover: "auto" }}
          ref={popoverRef}
          className="ct-audio-device-popover"
          style={{
            positionAnchor: anchorName,
            position: "absolute",
          } as any}
        >
          <div className="ct-device-menu-inner">
            <div
              className={`ct-device-menu-item ${selectedDeviceId === null ? "active" : ""}`}
              onClick={() => handleSelect(null)}
            >
              Varsayılan Cihaz
            </div>
            <div className="ct-device-menu-divider" />
            {devices.map((device, index) => (
              <div
                key={device.deviceId || index}
                className={`ct-device-menu-item ${selectedDeviceId === device.deviceId ? "active" : ""}`}
                onClick={() => handleSelect(device.deviceId)}
              >
                {device.label || `${isInput ? "Mikrofon" : "Hoparlör"} ${index + 1}`}
              </div>
            ))}
            {devices.length === 0 && !selectedDeviceId && (
              <div className="ct-device-menu-empty">
                Cihaz bulunamadı
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
