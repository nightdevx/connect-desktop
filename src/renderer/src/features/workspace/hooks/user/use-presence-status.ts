import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectablePresenceStatus } from "@shared/auth-contracts";
import workspaceService from "../../services";

// Away after five minutes with no keyboard, mouse or focus activity. Short
// enough that "idle" means something, long enough that reading a long message
// does not flip you.
const IDLE_AFTER_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;

export interface PresenceStatusController {
  // What the user picked. Idle is applied on top of it and never overwrites it,
  // so coming back from idle restores "dnd" rather than resetting to "online".
  selectedStatus: SelectablePresenceStatus;
  effectiveStatus: SelectablePresenceStatus;
  setSelectedStatus: (status: SelectablePresenceStatus) => void;
}

export const usePresenceStatus = (
  enabled: boolean,
): PresenceStatusController => {
  const [selectedStatus, setSelected] =
    useState<SelectablePresenceStatus>("online");
  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const publishedRef = useRef<SelectablePresenceStatus | null>(null);

  // Do-not-disturb and invisible are both deliberate statements; going idle
  // must not silently downgrade either of them. "Boşta" on top of "Çevrimdışı"
  // would be worse than wrong — it would put the user back on the map.
  const effectiveStatus: SelectablePresenceStatus =
    selectedStatus === "dnd" || selectedStatus === "offline"
      ? selectedStatus
      : isIdle
        ? "idle"
        : selectedStatus;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const markActive = (): void => {
      lastActivityRef.current = Date.now();
      setIsIdle((previous) => (previous ? false : previous));
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "focus",
    ];
    for (const event of events) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_AFTER_MS) {
        setIsIdle(true);
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, markActive);
      }
      window.clearInterval(interval);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || publishedRef.current === effectiveStatus) {
      return;
    }

    publishedRef.current = effectiveStatus;
    void workspaceService.setPresence({ status: effectiveStatus });
  }, [effectiveStatus, enabled]);

  const setSelectedStatus = useCallback(
    (status: SelectablePresenceStatus): void => {
      // Choosing a status is itself activity.
      lastActivityRef.current = Date.now();
      setIsIdle(false);
      setSelected(status);
    },
    [],
  );

  return { selectedStatus, effectiveStatus, setSelectedStatus };
};
