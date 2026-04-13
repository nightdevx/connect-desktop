import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { DesktopAppPreferences } from "../shared/desktop-api-types";

const defaultAppPreferences: DesktopAppPreferences = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
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
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.currentPreferences, null, 2),
        {
          encoding: "utf-8",
          mode: 0o600,
        },
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

const readSystemLaunchOnStartup = (): boolean | null => {
  if (process.platform === "linux") {
    return null;
  }

  try {
    return app.getLoginItemSettings().openAtLogin;
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
      openAsHidden: false,
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

export const getDesktopAppPreferences = (): DesktopAppPreferences => {
  const current = getStore().get();
  return syncLaunchOnStartupWithSystem(current);
};

export const updateDesktopAppPreferences = (
  patch: Partial<DesktopAppPreferences>,
): DesktopAppPreferences => {
  const current = getDesktopAppPreferences();
  const next: DesktopAppPreferences = {
    ...current,
    ...patch,
  };

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
