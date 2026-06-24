import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { join } from "node:path";
import * as Sentry from "@sentry/electron/main";
import { isDev } from "./utils/is-dev";
import {
  getDesktopAppPreferences,
  onDesktopAppPreferencesChanged,
} from "./app-preferences";
import { backendConfig } from "./config";

// Initialize Sentry for main process after env files are resolved by config
if (process.env.SENTRY_DSN && !isDev) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });
}
import { cleanupBeforeAppQuit, registerIpcHandlers } from "./ipc";
import { createAppMenu } from "./menu";

import { CaptureEngine } from "./streaming/capture-engine";
import {
  registerStreamingIpcHandlers,
  unregisterStreamingIpcHandlers,
} from "./streaming/ipc";
import {
  checkForAppUpdates,
  destroyModularUpdater,
  initializeModularUpdater,
  installDownloadedAppUpdate,
} from "./update";
import {
  isUpdaterHelperModeProcess,
  runUpdaterHelperMode,
} from "./update/helper-mode";

let mainWindow: BrowserWindow | null = null;
let quittingWithCleanup = false;
let tray: Tray | null = null;
let unsubscribePreferencesListener: (() => void) | null = null;
const captureEngine = new CaptureEngine();


process.env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
app.commandLine.appendSwitch("disable-features", "WebRtcUseDmabuf");
app.commandLine.appendSwitch("disable-gpu-memory-buffer-video-frames");
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");
app.commandLine.appendSwitch("disable-gpu-memory-buffers");
app.commandLine.appendSwitch("disable-webrtc-hw-decoding");
app.commandLine.appendSwitch("disable-webrtc-hw-encoding");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");

const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const isLinux = process.platform === "linux";
const APP_ICON_PATH = join(
  __dirname,
  isLinux ? "../../public/images/logo.png" : "../../public/images/logo.ico"
);
const APP_DISPLAY_NAME = "Connect";

const applyUserDataOverride = (): void => {
  const overridePath = process.env.CT_USER_DATA_DIR?.trim();
  if (!overridePath) {
    return;
  }

  const absoluteUserDataPath = join(process.cwd(), overridePath);
  app.setPath("userData", absoluteUserDataPath);
  app.setPath("sessionData", join(absoluteUserDataPath, "session-data"));
};

applyUserDataOverride();

const isUpdaterHelperMode = isUpdaterHelperModeProcess();
const hasSingleInstanceLock = isUpdaterHelperMode
  ? true
  : app.requestSingleInstanceLock();

if (!isUpdaterHelperMode && !hasSingleInstanceLock) {
  app.quit();
}

if (isUpdaterHelperMode) {
  runUpdaterHelperMode();
}

const emitWindowState = (win: BrowserWindow): void => {
  if (win.isDestroyed()) {
    return;
  }

  win.webContents.send(WINDOW_STATE_EVENT_CHANNEL, {
    isMaximized: win.isMaximized(),
  });
};

const showMainWindowFromTray = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const destroyTray = (): void => {
  if (!tray) {
    return;
  }

  tray.destroy();
  tray = null;
};

const buildTrayMenu = (): Menu => {
  return Menu.buildFromTemplate([
    {
      label: "Connect'i Aç",
      click: () => {
        showMainWindowFromTray();
      },
    },
    {
      type: "separator",
    },
    {
      label: "Çıkış",
      click: () => {
        app.quit();
      },
    },
  ]);
};

const ensureTray = (): void => {
  if (tray) {
    return;
  }

  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    showMainWindowFromTray();
  });
  tray.on("double-click", () => {
    showMainWindowFromTray();
  });
};

const hasTrayBehaviorEnabled = (): boolean => {
  const preferences = getDesktopAppPreferences();
  return preferences.minimizeToTray || preferences.closeToTray;
};

const syncTrayWithPreferences = (): void => {
  if (hasTrayBehaviorEnabled()) {
    ensureTray();
    return;
  }

  if (!tray) {
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    return;
  }

  destroyTray();
};

const hideWindowToTray = (win: BrowserWindow): void => {
  ensureTray();
  win.hide();
};

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    icon: nativeImage.createFromPath(APP_ICON_PATH),
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (isDev && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (isDev) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  win.once("ready-to-show", () => {
    win.show();
    emitWindowState(win);
  });

  win.on("maximize", () => emitWindowState(win));
  win.on("unmaximize", () => emitWindowState(win));

  win.on("close", (event) => {
    if (quittingWithCleanup) {
      return;
    }

    const preferences = getDesktopAppPreferences();
    if (!preferences.closeToTray) {
      return;
    }

    event.preventDefault();
    hideWindowToTray(win);
  });

  win.on("show", () => {
    syncTrayWithPreferences();
  });

  return win;
}

if (!isUpdaterHelperMode && hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const envPathLabel = backendConfig.envFilePath ?? "not-found";
    console.info(
      `[Connect] Backend: ${backendConfig.url} (source=${backendConfig.source}, env=${envPathLabel})`,
    );

    initializeModularUpdater({
      beforeInstall: cleanupBeforeAppQuit,
      periodicCheckMs: 15 * 60 * 1000,
    });
    registerIpcHandlers();
    registerStreamingIpcHandlers({
      captureEngine,
    });

    if (!unsubscribePreferencesListener) {
      unsubscribePreferencesListener = onDesktopAppPreferencesChanged(() => {
        syncTrayWithPreferences();
      });
    }

    createAppMenu({
      checkForUpdates: async () => {
        await checkForAppUpdates();
      },
      installDownloadedUpdate: async () => {
        await installDownloadedAppUpdate();
      },
    });

    mainWindow = createMainWindow();
    syncTrayWithPreferences();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }

      showMainWindowFromTray();
    });
  });

  app.on("before-quit", (event) => {
    if (quittingWithCleanup) {
      return;
    }

    event.preventDefault();
    quittingWithCleanup = true;

    const maxWaitMs = 1200;
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, maxWaitMs);
    });

    void Promise.race([cleanupBeforeAppQuit(), timeout]).finally(() => {
      unregisterStreamingIpcHandlers();
      destroyModularUpdater();
      if (unsubscribePreferencesListener) {
        unsubscribePreferencesListener();
        unsubscribePreferencesListener = null;
      }
      destroyTray();
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
