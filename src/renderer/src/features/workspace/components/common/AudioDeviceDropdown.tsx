import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  type ReactNode,
} from "react";

interface AudioDeviceDropdownProps {
  children: ReactNode;
  kind: "input" | "output";
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}

/** Kept clear of the window edges, and of the pointer itself. */
const VIEWPORT_MARGIN_PX = 8;

/**
 * Right-click a microphone or headphone control to pick the device it uses.
 *
 * Positioned AT THE CURSOR, like every other context menu in this app.
 *
 * It used to be placed with CSS anchor positioning against a fixed
 * `anchor-name` per kind — `--audio-device-anchor-input` and
 * `--audio-device-anchor-output`. Both names are declared by every instance on
 * screen at once: the toolbar's two buttons, the same two on the local
 * participant tile, and the direct-call toolbar's pair. When several elements
 * share an anchor name the name resolves to none of them, so the popover fell
 * back to its static position — and a popover lives in the top layer, whose
 * containing block is the viewport, so "no position" meant the bottom-left
 * corner of the window no matter which control had been clicked.
 */
export function AudioDeviceDropdown({
  children,
  kind,
  devices,
  selectedDeviceId,
  onSelectDevice,
}: AudioDeviceDropdownProps) {
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInput = kind === "input";
  const isOpen = anchorPoint !== null;

  const close = (): void => {
    const popover = popoverRef.current;
    if (popover) {
      try {
        popover.hidePopover();
      } catch {
        // Already closed, or the popover has been unmounted under us.
      }
    }
    setAnchorPoint(null);
  };

  const handleSelect = (deviceId: string | null): void => {
    onSelectDevice(deviceId);
    close();
  };

  const handleContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    // The tile underneath opens its own participant menu on right-click, and
    // the lobby row underneath that has one too.
    event.stopPropagation();
    setAnchorPoint({ x: event.clientX, y: event.clientY });
  };

  // Shown and placed before the frame is painted, so the menu never appears at
  // the wrong spot first. The measurement has to happen AFTER showPopover():
  // a closed popover is display:none and measures 0x0.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!anchorPoint || !popover) {
      return;
    }

    try {
      popover.showPopover();
    } catch {
      // Already open.
    }

    const rect = popover.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        anchorPoint.x,
        window.innerWidth - rect.width - VIEWPORT_MARGIN_PX,
      ),
    );
    // Opens upward when there is no room below — which is the common case, as
    // these controls sit in a toolbar at the bottom of the stage.
    const opensDown =
      anchorPoint.y + rect.height + VIEWPORT_MARGIN_PX <= window.innerHeight;
    const top = opensDown
      ? anchorPoint.y
      : Math.max(VIEWPORT_MARGIN_PX, anchorPoint.y - rect.height);

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }, [anchorPoint]);

  // Light dismiss (Escape, or a click outside) closes the popover itself; this
  // is what tells React about it.
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) {
      return;
    }

    const handleToggle = (event: Event): void => {
      if ((event as ToggleEvent).newState === "closed") {
        setAnchorPoint(null);
      }
    };

    popover.addEventListener("toggle", handleToggle);
    return () => {
      popover.removeEventListener("toggle", handleToggle);
    };
  }, [isOpen]);

  return (
    <div className="ct-audio-device-anchor" onContextMenu={handleContextMenu}>
      {children}

      {anchorPoint && (
        <div
          {...{ popover: "auto" }}
          ref={popoverRef}
          className="ct-audio-device-popover"
          style={{ left: anchorPoint.x, top: anchorPoint.y }}
        >
          <div className="ct-device-menu-inner">
            <button
              type="button"
              className={`ct-device-menu-item ${selectedDeviceId === null ? "active" : ""}`}
              onClick={() => handleSelect(null)}
            >
              Varsayılan Cihaz
            </button>

            <div className="ct-device-menu-divider" />

            {devices.map((device, index) => (
              <button
                type="button"
                key={device.deviceId || index}
                className={`ct-device-menu-item ${selectedDeviceId === device.deviceId ? "active" : ""}`}
                onClick={() => handleSelect(device.deviceId)}
              >
                {device.label ||
                  `${isInput ? "Mikrofon" : "Hoparlör"} ${index + 1}`}
              </button>
            ))}

            {devices.length === 0 && !selectedDeviceId && (
              <div className="ct-device-menu-empty">Cihaz bulunamadı</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
