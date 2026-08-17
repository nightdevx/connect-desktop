import { useEffect, useState } from "react";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";

/**
 * The main process's own preferences (global hotkeys, launch behaviour), read
 * over IPC.
 *
 * Re-read on window focus. The settings panel writes them through its own IPC
 * call and there is no change event for them, so refocusing is the cheapest
 * point at which to notice an edit made in another section — without it, a
 * hotkey rebound in Ayarlar did not take effect until the app restarted.
 */
export function useDesktopPreferences(): DesktopAppPreferences | null {
  const [preferences, setPreferences] = useState<DesktopAppPreferences | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    const load = (): void => {
      void window.desktopApi.getAppPreferences().then((result) => {
        if (active && result.ok && result.data?.preferences) {
          setPreferences(result.data.preferences);
        }
      });
    };

    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  return preferences;
}
