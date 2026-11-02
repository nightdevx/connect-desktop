import { BrowserWindow, globalShortcut } from "electron";
import type { DesktopHotkeyEvent } from "../shared/desktop-api-types";
import {
  getDesktopAppPreferences,
  onDesktopAppPreferencesChanged,
} from "./app-preferences";
import { configurePushToTalk } from "./push-to-talk";

export const HOTKEY_EVENT_CHANNEL = "desktop:hotkey";

// Mute and deafen could only be toggled by finding the window and clicking.
// While gaming full-screen that means alt-tabbing out mid-sentence.
//
// Electron's globalShortcut fires on key-DOWN only, which is enough for these
// toggles. Hold-to-talk needs the key-up too, so it comes from push-to-talk.ts
// and goes out on the same channel.

type HotkeyBinding = {
  action: "toggle-mute" | "toggle-deafen";
  accelerator: string;
};

let registered: string[] = [];
let unsubscribePreferences: (() => void) | null = null;

const broadcast = (event: DesktopHotkeyEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      continue;
    }
    window.webContents.send(HOTKEY_EVENT_CHANNEL, event);
  }
};

const unregisterAll = (): void => {
  for (const accelerator of registered) {
    try {
      globalShortcut.unregister(accelerator);
    } catch {
      // Already gone; nothing to undo.
    }
  }
  registered = [];
};

const applyBindings = (): void => {
  unregisterAll();

  const preferences = getDesktopAppPreferences();
  configurePushToTalk(
    preferences.pushToTalk ? preferences.pushToTalkKey : null,
    (pressed) => {
      broadcast({ action: "push-to-talk", pressed });
    },
  );

  const bindings: HotkeyBinding[] = [
    { action: "toggle-mute", accelerator: preferences.hotkeyToggleMute },
    { action: "toggle-deafen", accelerator: preferences.hotkeyToggleDeafen },
  ];

  for (const binding of bindings) {
    if (!binding.accelerator) {
      continue;
    }

    try {
      // register returns false when another application already owns the
      // combination. Failing silently would leave the user pressing a key that
      // does nothing with no explanation, so it is logged.
      const ok = globalShortcut.register(binding.accelerator, () => {
        broadcast({ action: binding.action });
      });

      if (!ok) {
        console.warn(
          `[hotkeys] ${binding.accelerator} is already taken by another application`,
        );
        continue;
      }

      registered.push(binding.accelerator);
    } catch (error) {
      console.warn(
        `[hotkeys] could not register ${binding.accelerator}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
};

export const installGlobalHotkeys = (): void => {
  applyBindings();
  unsubscribePreferences?.();
  unsubscribePreferences = onDesktopAppPreferencesChanged(() => {
    applyBindings();
  });
};

export const disposeGlobalHotkeys = (): void => {
  unsubscribePreferences?.();
  unsubscribePreferences = null;
  unregisterAll();
  configurePushToTalk(null, () => undefined);
};
