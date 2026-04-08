import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { backendConfig } from "./config";
import { cleanupBeforeAppQuit, registerIpcHandlers } from "./ipc";
import { createAppMenu } from "./menu";
import {
  checkForAppUpdates,
  initializeModularUpdater,
  installDownloadedAppUpdate,
} from "./update";
import { isDev } from "./utils/is-dev";

let mainWindow: BrowserWindow | null = null;
let quittingWithCleanup = false;

const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const APP_ICON_PATH = join(__dirname, "../../public/images/logo.ico");

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

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

const emitWindowState = (win: BrowserWindow): void => {
  if (win.isDestroyed()) {
    return;
  }

  win.webContents.send(WINDOW_STATE_EVENT_CHANNEL, {
    isMaximized: win.isMaximized(),
  });
};

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    icon: APP_ICON_PATH,
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

  win.once("ready-to-show", () => {
    win.show();
    emitWindowState(win);
  });

  win.on("maximize", () => emitWindowState(win));
  win.on("unmaximize", () => emitWindowState(win));

  return win;
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
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
    });
    registerIpcHandlers();

    createAppMenu({
      checkForUpdates: async () => {
        await checkForAppUpdates();
      },
      installDownloadedUpdate: async () => {
        await installDownloadedAppUpdate();
      },
    });

    mainWindow = createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
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
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
