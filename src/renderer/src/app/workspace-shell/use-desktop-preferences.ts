import { useEffect, useState } from "react";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";
import { subscribeDesktopPreferences } from "@/store/desktop-preferences";

/**
 * The main process's own preferences (global hotkeys, push-to-talk, launch
 * behaviour), read over IPC.
 *
 * A save in Ayarlar arrives at once through subscribeDesktopPreferences: the
 * settings panel lives in this same window, so no focus event ever fires for
 * it, and push-to-talk switched on there left the mic open until the window
 * was refocused. The re-read on focus stays for anything changed outside the
 * panel.
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
    const unsubscribe = subscribeDesktopPreferences(setPreferences);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      unsubscribe();
    };
  }, []);

  return preferences;
}
