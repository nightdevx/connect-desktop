import { BrowserWindow, globalShortcut } from "electron";
import type { DesktopHotkeyEvent } from "../shared/desktop-api-types";
import {
  getDesktopAppPreferences,
  onDesktopAppPreferencesChanged,
} from "./app-preferences";

export const HOTKEY_EVENT_CHANNEL = "desktop:hotkey";

// Mute and deafen could only be toggled by finding the window and clicking.
// While gaming full-screen that means alt-tabbing out mid-sentence.
//
// Scope limit, stated plainly: Electron's globalShortcut fires on key-DOWN only
// and gives no key-up, so genuine hold-to-talk is impossible here without a
// native keyboard hook (a new native dependency on every platform). These are
// toggles. Hold-to-talk exists too, but is handled in the renderer and
// therefore only works while the window has focus — see usePushToTalk.

type HotkeyBinding = {
  action: DesktopHotkeyEvent["action"];
  accelerator: string;
};

let registered: string[] = [];
let unsubscribePreferences: (() => void) | null = null;

const broadcast = (action: DesktopHotkeyEvent["action"]): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      continue;
    }
    window.webContents.send(HOTKEY_EVENT_CHANNEL, { action });
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
        broadcast(binding.action);
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
};
