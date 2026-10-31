import { app, desktopCapturer, shell, systemPreferences } from "electron";
import { handle } from "../handle";
import { ok, fail, getWindowFromSender } from "../context";
import {
  appPreferencesSchema,
  freeGamesSchema,
  gifSearchSchema,
  notifySchema,
  windowAttentionSchema,
} from "../validators";
import { isKlipyConfigured, klipyApiKey } from "../../config";
import { searchKlipyGifs } from "../../clients/klipy-client";
import { showDesktopNotification } from "../../notifications";
import {
  getDesktopAppPreferences,
  updateDesktopAppPreferences,
} from "../../app-preferences";
import {
  checkForAppUpdates,
  getAppUpdateSnapshot,
  installDownloadedAppUpdate,
} from "../../update";
import { showUpdaterWindow } from "../../update/updater-window";
import { getFreeGames } from "../../free-games-poller";
import { detectGame } from "../../game-activity-poller";
import { openWebRtcInternalsWindow } from "../../webrtc-internals-window";
import { DesktopApiError } from "../../backend-client";
import { SCREEN_RECORDING_PERMISSION_MESSAGE } from "../../../shared/streaming-contracts";
import { releasePageUrl } from "../../../shared/update-contracts";

const SCREEN_RECORDING_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

export function registerAppHandlers(): void {
  handle("app:ping", async () => "pong");
  handle("app:get-version", async () => app.getVersion());
  handle("desktop:get-version", async () => app.getVersion());

  handle("desktop:app-preferences-get", async () => {
    try {
      const preferences = getDesktopAppPreferences();
      return ok({ preferences });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:app-preferences-set", async (_event, payload) => {
    try {
      const parsed = appPreferencesSchema.parse(payload);
      const preferences = updateDesktopAppPreferences(parsed);
      return ok({ preferences });
    } catch (error) {
      return fail(error);
    }
  });

  // Whether the button exists at all. A boolean, never the key: the renderer
  // has no legitimate use for the key and every way it could hold one ends with
  // Sentry recording it.
  handle("desktop:gif-enabled", async () => {
    try {
      return ok({ enabled: isKlipyConfigured });
    } catch (error) {
      return fail(error);
    }
  });

  // The GIF search runs here rather than in the renderer because KLIPY carries
  // the API key as a URL PATH SEGMENT. The renderer runs @sentry/electron with
  // default integrations, and its Breadcrumbs integration records fetch URLs
  // verbatim -- so a renderer-side search would have attached the key to every
  // unrelated error report the app ever sent.
  handle("desktop:gif-search", async (_event, payload: unknown) => {
    try {
      const parsed = gifSearchSchema.parse(payload);
      if (!klipyApiKey) {
        // No key configured: answer empty rather than error. The button is not
        // rendered in this state, so this is only reachable by a stale panel.
        return ok({ items: [] });
      }

      const items = await searchKlipyGifs(klipyApiKey, (parsed.query ?? "").trim());
      return ok({ items });
    } catch (error) {
      return fail(error);
    }
  });

  // Four third-party feeds, fetched here rather than in the renderer:
  // Epic's endpoint sends no CORS headers at all, so a renderer fetch is
  // blocked before it starts. The poller owns the cache and the cooldown;
  // this is only the door onto them.
  handle("desktop:free-games", async (_event, payload: unknown) => {
    try {
      const parsed = freeGamesSchema.parse(payload);
      return ok(await getFreeGames({ refresh: parsed.refresh }));
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:notify", async (_event, payload) => {
    try {
      const parsed = notifySchema.parse(payload);
      return ok(showDesktopNotification(parsed));
    } catch (error) {
      return fail(error);
    }
  });

  // Hardware-acceleration switches are read once at GPU process spawn, so the
  // setting only takes effect after a full restart.
  handle("desktop:app-relaunch", async () => {
    try {
      app.relaunch();
      app.quit();
      return ok({ relaunching: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:update-check", async () => {
    try {
      const result = await checkForAppUpdates();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:update-install", async () => {
    try {
      const result = await installDownloadedAppUpdate();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:update-state", async () => {
    try {
      const result = getAppUpdateSnapshot();
      return ok({ state: result });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:update-debug", async () => {
    try {
      if (app.isPackaged) {
        return ok({ started: false, reason: "NOT_DEV_MODE" });
      }

      const started = await showUpdaterWindow({
        installer: null,
        version: app.getVersion(),
        releaseUrl: releasePageUrl(null),
        demo: "ok",
      });
      return ok(started ? { started } : { started, reason: "SPAWN_FAILED" });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:open-webrtc-internals", async () => {
    try {
      openWebRtcInternalsWindow();
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:screen-capture-sources", async () => {
    try {
      if (
        process.platform === "darwin" &&
        systemPreferences.getMediaAccessStatus("screen") !== "granted"
      ) {
        // Asking once is what lists Connect under Screen Recording (and shows
        // macOS's own prompt the first time); its answer is blank sources.
        await desktopCapturer
          .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
          .catch(() => []);
        throw new DesktopApiError(
          "SCREEN_RECORDING_PERMISSION",
          403,
          SCREEN_RECORDING_PERMISSION_MESSAGE,
        );
      }

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

  // macOS only: the Screen Recording pane of System Settings, where the share
  // dialog sends a user who has not allowed it yet.
  handle("desktop:open-screen-recording-settings", async () => {
    try {
      if (process.platform !== "darwin") {
        return ok({ opened: false });
      }
      await shell.openExternal(SCREEN_RECORDING_SETTINGS_URL);
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:running-game", async () => {
    try {
      return ok({ name: await detectGame() });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:window-minimize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.minimize();
      return ok({ minimized: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:window-toggle-maximize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      // `isMaximized`, not `maximized`: the renderer and DesktopWindowState
      // both read isMaximized, so the old key produced undefined on every read
      // and the custom titlebar's maximize icon never flipped.
      if (win.isMaximized()) {
        win.unmaximize();
        return ok({ isMaximized: false });
      }

      win.maximize();
      return ok({ isMaximized: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:window-close", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.close();
      return ok({ closed: true });
    } catch (error) {
      return fail(error);
    }
  });

  handle(
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
        return ok({ attention: true });
      } catch (error) {
        return fail(error);
      }
    },
  );

  handle("desktop:window-state", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      return ok({
        isMaximized: win.isMaximized(),
        minimized: win.isMinimized(),
        focused: win.isFocused(),
      });
    } catch (error) {
      return fail(error);
    }
  });
}
