import { app, ipcMain, desktopCapturer, BrowserWindow } from "electron";
import { ok, fail, getWindowFromSender } from "../context";
import { appPreferencesSchema, windowAttentionSchema } from "../validators";
import {
  getDesktopAppPreferences,
  updateDesktopAppPreferences,
} from "../../app-preferences";
import {
  checkForAppUpdates,
  getAppUpdateSnapshot,
  installDownloadedAppUpdate,
} from "../../update";
import { launchMockUpdaterWindow } from "../../update/helper-mode";

export function registerAppHandlers(): void {
  ipcMain.handle("app:ping", async () => "pong");
  ipcMain.handle("app:get-version", async () => app.getVersion());
  ipcMain.handle("desktop:get-version", async () => app.getVersion());

  ipcMain.handle("desktop:app-preferences-get", async () => {
    try {
      const preferences = getDesktopAppPreferences();
      return ok({ preferences });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:app-preferences-set", async (_event, payload) => {
    try {
      const parsed = appPreferencesSchema.parse(payload);
      const preferences = updateDesktopAppPreferences(parsed);
      return ok({ preferences });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-check", async () => {
    try {
      const result = await checkForAppUpdates();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-install", async () => {
    try {
      const result = await installDownloadedAppUpdate();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-state", async () => {
    try {
      const result = getAppUpdateSnapshot();
      return ok({ state: result });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-debug", async () => {
    try {
      if (app.isPackaged) {
        return ok({ started: false, reason: "NOT_DEV_MODE" });
      }

      const result = launchMockUpdaterWindow();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:screen-capture-sources", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: { width: 300, height: 300 },
        fetchWindowIcons: true,
      });

      const mapped = sources.map((source) => ({
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        id: source.id,
        name: source.name,
        displayId:
          source.display_id && source.display_id.length > 0
            ? source.display_id
            : null,
        previewDataUrl: source.thumbnail.toDataURL(),
      }));

      return ok({ sources: mapped });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:window-minimize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.minimize();
      return ok({ minimized: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:window-toggle-maximize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      if (win.isMaximized()) {
        win.unmaximize();
        return ok({ maximized: false });
      }

      win.maximize();
      return ok({ maximized: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:window-close", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.close();
      return ok({ closed: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:window-attention",
    async (event, payload: unknown) => {
      try {
        const parsed = windowAttentionSchema.parse(payload);
        const win = getWindowFromSender(event.sender);
        if (parsed.enabled) {
          win.flashFrame(true);
        } else {
          win.flashFrame(false);
        }
        return ok({ requested: true });
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:window-state", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      return ok({
        maximized: win.isMaximized(),
        minimized: win.isMinimized(),
        focused: win.isFocused(),
      });
    } catch (error) {
      return fail(error);
    }
  });
}
