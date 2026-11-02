import type { DesktopAppPreferences } from "@shared/desktop-api-types";

// The settings panel saves desktop preferences over IPC; the workspace reads
// its own copy (use-desktop-preferences.ts). Both live in the same window, so a
// save there must reach the copy here at once: push-to-talk switched on in
// Ayarlar has to close the mic now, not the next time the window is focused.
type Listener = (preferences: DesktopAppPreferences) => void;

const listeners = new Set<Listener>();

export const publishDesktopPreferences = (
  preferences: DesktopAppPreferences,
): void => {
  for (const listener of listeners) {
    listener(preferences);
  }
};

export const subscribeDesktopPreferences = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
