import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { DesktopAppPreferences } from "../shared/desktop-api-types";
import { writeFileAtomic } from "./utils/atomic-write";

const defaultAppPreferences: DesktopAppPreferences = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  hardwareAcceleration: true,
  desktopNotifications: true,
  // Unbound by default: a global shortcut is taken from every other app on the
  // machine, so claiming one without being asked is rude.
  hotkeyToggleMute: "",
  hotkeyToggleDeafen: "",
  pushToTalk: false,
  pushToTalkKey: "Space",
  freeGameNotifications: true,
  shareGameActivity: true,
};

// An accelerator arrives from the renderer, so it is untrusted input that ends
// up in globalShortcut.register. Electron throws on a malformed string, and an
// absurdly long one is never a real binding.
const sanitizeAccelerator = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.length > 64 || !/^[A-Za-z0-9+ ]+$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
};

const sanitizeKeyCode = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  // KeyboardEvent.code values are ASCII identifiers.
  return /^[A-Za-z0-9]{1,24}$/.test(trimmed) ? trimmed : fallback;
};

type PreferencesListener = (preferences: DesktopAppPreferences) => void;

const listeners = new Set<PreferencesListener>();

const notifyPreferencesChanged = (preferences: DesktopAppPreferences): void => {
  for (const listener of listeners) {
    listener(preferences);
  }
};

const sanitizeLoadedPreferences = (payload: unknown): DesktopAppPreferences => {
  if (!payload || typeof payload !== "object") {
    return { ...defaultAppPreferences };
  }

  const source = payload as Record<string, unknown>;

  return {
    launchOnStartup:
      typeof source.launchOnStartup === "boolean"
        ? source.launchOnStartup
        : defaultAppPreferences.launchOnStartup,
    minimizeToTray:
      typeof source.minimizeToTray === "boolean"
        ? source.minimizeToTray
        : defaultAppPreferences.minimizeToTray,
    closeToTray:
      typeof source.closeToTray === "boolean"
        ? source.closeToTray
        : defaultAppPreferences.closeToTray,
    hardwareAcceleration:
      typeof source.hardwareAcceleration === "boolean"
        ? source.hardwareAcceleration
        : defaultAppPreferences.hardwareAcceleration,
    desktopNotifications:
      typeof source.desktopNotifications === "boolean"
        ? source.desktopNotifications
        : defaultAppPreferences.desktopNotifications,
    hotkeyToggleMute: sanitizeAccelerator(
      source.hotkeyToggleMute,
      defaultAppPreferences.hotkeyToggleMute,
    ),
    hotkeyToggleDeafen: sanitizeAccelerator(
      source.hotkeyToggleDeafen,
      defaultAppPreferences.hotkeyToggleDeafen,
    ),
    pushToTalk:
      typeof source.pushToTalk === "boolean"
        ? source.pushToTalk
        : defaultAppPreferences.pushToTalk,
    pushToTalkKey: sanitizeKeyCode(
      source.pushToTalkKey,
      defaultAppPreferences.pushToTalkKey,
    ),
    freeGameNotifications:
      typeof source.freeGameNotifications === "boolean"
        ? source.freeGameNotifications
        : defaultAppPreferences.freeGameNotifications,
    shareGameActivity:
      typeof source.shareGameActivity === "boolean"
        ? source.shareGameActivity
        : defaultAppPreferences.shareGameActivity,
  };
};

class AppPreferencesStore {
  private readonly filePath: string;

  private currentPreferences: DesktopAppPreferences = {
    ...defaultAppPreferences,
  };

  public constructor() {
    this.filePath = path.join(app.getPath("userData"), "app-preferences.json");
    this.loadFromDisk();
  }

  public get(): DesktopAppPreferences {
    return { ...this.currentPreferences };
  }

  public set(preferences: DesktopAppPreferences): void {
    this.currentPreferences = { ...preferences };
    this.persist();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.currentPreferences = sanitizeLoadedPreferences(JSON.parse(raw));
    } catch {
      this.currentPreferences = { ...defaultAppPreferences };
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileAtomic(
        this.filePath,
        JSON.stringify(this.currentPreferences, null, 2),
      );
    } catch {
      // no-op
    }
  }
}

let sharedStore: AppPreferencesStore | null = null;

const getStore = (): AppPreferencesStore => {
  if (!sharedStore) {
    sharedStore = new AppPreferencesStore();
  }

  return sharedStore;
};

// Windows keeps login items as values under HKCU\...\Run, and Electron names
// the value after the AppUserModelID unless told otherwise. Every build from
// before index.ts set that ID wrote "electron.app.Connect". Keeping the name
// means turning the setting off removes the entry those builds left, and
// turning it on overwrites it, instead of adding a second entry that would
// start the app twice at sign-in.
const WINDOWS_LOGIN_ITEM_NAME = "electron.app.Connect";

const readSystemLaunchOnStartup = (): boolean | null => {
  if (process.platform === "linux") {
    return null;
  }

  try {
    const settings = app.getLoginItemSettings();
    // openAtLogin only reads the value named after the current AppUserModelID,
    // so the entry under the old name would read as off.
    // executableWillLaunchAtLogin matches any entry that starts this
    // executable, and is false when the user disabled it in Task Manager.
    return process.platform === "win32"
      ? settings.executableWillLaunchAtLogin
      : settings.openAtLogin;
  } catch {
    return null;
  }
};

const applySystemLaunchOnStartup = (enabled: boolean): void => {
  if (process.platform === "linux") {
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: WINDOWS_LOGIN_ITEM_NAME,
    });
  } catch {
    // no-op
  }
};

const syncLaunchOnStartupWithSystem = (
  preferences: DesktopAppPreferences,
): DesktopAppPreferences => {
  const systemValue = readSystemLaunchOnStartup();
  if (systemValue == null || preferences.launchOnStartup === systemValue) {
    return preferences;
  }

  const synced = {
    ...preferences,
    launchOnStartup: systemValue,
  };

  getStore().set(synced);
  return synced;
};

// Reads the stored preferences without touching app.getLoginItemSettings(),
// so it is safe to call before app.whenReady() — used by the startup GPU/WebRTC
// switch setup, which must run before the GPU process spawns.
export const peekDesktopAppPreferences = (): DesktopAppPreferences => {
  return getStore().get();
};

export const getDesktopAppPreferences = (): DesktopAppPreferences => {
  const current = getStore().get();
  return syncLaunchOnStartupWithSystem(current);
};

export const updateDesktopAppPreferences = (
  patch: Partial<DesktopAppPreferences>,
): DesktopAppPreferences => {
  const current = getDesktopAppPreferences();
  // Re-sanitize: the patch comes from the renderer, and the accelerators reach
  // globalShortcut.register from here.
  const next: DesktopAppPreferences = sanitizeLoadedPreferences({
    ...current,
    ...patch,
  });

  if (next.launchOnStartup !== current.launchOnStartup) {
    applySystemLaunchOnStartup(next.launchOnStartup);
  }

  const synced = syncLaunchOnStartupWithSystem(next);
  getStore().set(synced);
  notifyPreferencesChanged(synced);
  return synced;
};

export const onDesktopAppPreferencesChanged = (
  listener: PreferencesListener,
): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};
