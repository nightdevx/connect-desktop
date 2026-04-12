import { app, BrowserWindow, dialog } from "electron";
import { spawn } from "node:child_process";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import {
  UPDATE_EVENT_CHANNEL,
  type AppUpdateEvent,
  type AppUpdatePhase,
  type AppUpdateSnapshot,
} from "../../shared/update-contracts";

interface ModularUpdaterOptions {
  beforeInstall: () => Promise<void>;
  startupCheckDelayMs?: number;
  periodicCheckMs?: number;
}

interface UpdaterWindowState {
  title: string;
  message: string;
  progressPercent: number | null;
  phase: AppUpdatePhase;
}

export interface CheckForUpdatesResponse {
  requested: boolean;
  reason?: string;
}

export interface InstallUpdateResponse {
  accepted: boolean;
  reason?: string;
}

const defaultStartupCheckDelayMs = 15_000;
const defaultPeriodicCheckMs = 4 * 60 * 60 * 1_000;

const createUpdaterWindowHtml = (): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect Updater</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Trebuchet MS", "Century Gothic", Verdana, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 8% 12%, rgba(110, 231, 183, 0.15), transparent 40%),
          radial-gradient(circle at 88% 85%, rgba(56, 189, 248, 0.2), transparent 42%),
          linear-gradient(160deg, #07101d 0%, #0d1a2e 46%, #0b1120 100%);
        color: #e6f6ff;
      }
      .card {
        width: min(500px, calc(100vw - 32px));
        border: 1px solid rgba(125, 211, 252, 0.28);
        border-radius: 18px;
        padding: 18px;
        background:
          linear-gradient(170deg, rgba(5, 28, 50, 0.86), rgba(6, 18, 36, 0.9));
        box-shadow:
          0 24px 48px rgba(0, 0, 0, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: linear-gradient(145deg, #38bdf8, #34d399);
        color: #06253c;
        display: grid;
        place-items: center;
        font-weight: 800;
        letter-spacing: 0.04em;
      }
      .title-wrap {
        display: grid;
        gap: 2px;
      }
      .sub {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #9ad5f0;
      }
      .title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      .message {
        margin-top: 10px;
        color: #c7e4f5;
        line-height: 1.45;
        min-height: 44px;
      }
      .progress-wrap {
        margin-top: 12px;
      }
      .progress {
        width: 100%;
        height: 11px;
        border-radius: 999px;
        border: 1px solid rgba(147, 197, 253, 0.25);
        background: rgba(255, 255, 255, 0.07);
        overflow: hidden;
      }
      .bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #38bdf8, #34d399);
        transition: width 160ms ease;
      }
      .percent {
        margin-top: 7px;
        font-size: 12px;
        color: #9dcfe8;
      }
      .steps {
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .step {
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 10px;
        padding: 8px 6px;
        text-align: center;
        font-size: 11px;
        color: #8fb0c3;
        background: rgba(255, 255, 255, 0.02);
      }
      .step.is-active {
        color: #e7fbff;
        border-color: rgba(56, 189, 248, 0.8);
        box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3) inset;
      }
      .step.is-done {
        color: #d8ffed;
        border-color: rgba(52, 211, 153, 0.9);
      }
      .step.is-error {
        color: #ffd2d2;
        border-color: rgba(248, 113, 113, 0.9);
      }
      .hint {
        margin: 12px 0 0;
        font-size: 11px;
        color: #7fa5b9;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <header class="head">
        <div class="brand-mark">CT</div>
        <div class="title-wrap">
          <span class="sub">Connect Together</span>
          <h1 class="title" id="title">Desktop Updater</h1>
        </div>
      </header>

      <p class="message" id="message">Guncelleme hazirlaniyor...</p>

      <ul class="steps">
        <li class="step" id="step-check">Kontrol</li>
        <li class="step" id="step-download">Indir</li>
        <li class="step" id="step-install">Kur</li>
        <li class="step" id="step-relaunch">Yeniden Ac</li>
      </ul>

      <div class="progress-wrap" id="progress-wrap">
        <div class="progress"><div class="bar" id="bar"></div></div>
        <div class="percent" id="percent">Bekleniyor</div>
      </div>

      <p class="hint">Kurulum otomatik yapilir. Kullanici adimi gerekmez.</p>
    </main>
    <script>
      window.__connectUpdaterSetState = (payload) => {
        const titleEl = document.getElementById("title");
        const messageEl = document.getElementById("message");
        const barEl = document.getElementById("bar");
        const percentEl = document.getElementById("percent");
        const wrapEl = document.getElementById("progress-wrap");
        const stepCheck = document.getElementById("step-check");
        const stepDownload = document.getElementById("step-download");
        const stepInstall = document.getElementById("step-install");
        const stepRelaunch = document.getElementById("step-relaunch");

        const steps = [stepCheck, stepDownload, stepInstall, stepRelaunch];
        for (const item of steps) {
          if (!item) {
            continue;
          }
          item.classList.remove("is-active", "is-done", "is-error");
        }

        if (titleEl && typeof payload.title === "string") {
          titleEl.textContent = payload.title;
        }

        if (messageEl && typeof payload.message === "string") {
          messageEl.textContent = payload.message;
        }

        const phase = typeof payload.phase === "string" ? payload.phase : "idle";
        const mark = (el, cls) => {
          if (el) {
            el.classList.add(cls);
          }
        };

        if (phase === "checking" || phase === "available" || phase === "not-available") {
          mark(stepCheck, phase === "not-available" ? "is-done" : "is-active");
        }

        if (phase === "downloading") {
          mark(stepCheck, "is-done");
          mark(stepDownload, "is-active");
        }

        if (phase === "downloaded") {
          mark(stepCheck, "is-done");
          mark(stepDownload, "is-done");
          mark(stepInstall, "is-active");
        }

        if (phase === "installing") {
          mark(stepCheck, "is-done");
          mark(stepDownload, "is-done");
          mark(stepInstall, "is-done");
          mark(stepRelaunch, "is-active");
        }

        if (phase === "error") {
          mark(stepInstall, "is-error");
        }

        const hasProgress =
          typeof payload.progressPercent === "number" &&
          Number.isFinite(payload.progressPercent);

        if (wrapEl) {
          wrapEl.style.display = hasProgress ? "block" : "none";
        }

        if (hasProgress) {
          const clamped = Math.max(0, Math.min(100, payload.progressPercent));
          if (barEl) {
            barEl.style.width = clamped.toFixed(2) + "%";
          }
          if (percentEl) {
            percentEl.textContent = "%" + clamped.toFixed(2);
          }
        }
      };
    </script>
  </body>
</html>`;
};

class ModularUpdater {
  private initialized = false;
  private listenersBound = false;
  private startupCheckTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private promptingForInstall = false;
  private installing = false;
  private updaterWindow: BrowserWindow | null = null;
  private updaterWindowLoaded = false;
  private pendingUpdaterWindowState: UpdaterWindowState | null = null;

  private snapshot: AppUpdateSnapshot = {
    phase: "idle",
    currentVersion: app.getVersion(),
    nextVersion: null,
    releaseName: null,
    releaseDate: null,
    progressPercent: null,
    message: "Guncelleme henuz kontrol edilmedi",
    timestamp: new Date().toISOString(),
  };

  public constructor(private readonly options: ModularUpdaterOptions) {}

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!app.isPackaged) {
      this.setSnapshot("disabled", "Gelistirme modunda guncelleme devre disi");
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    this.bindListeners();
    this.scheduleChecks();
  }

  public getSnapshot(): AppUpdateSnapshot {
    return { ...this.snapshot };
  }

  public destroy(): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }

    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    if (this.updaterWindow && !this.updaterWindow.isDestroyed()) {
      this.updaterWindow.destroy();
    }

    this.updaterWindow = null;
    this.updaterWindowLoaded = false;
    this.pendingUpdaterWindowState = null;
  }

  public async checkForUpdates(): Promise<CheckForUpdatesResponse> {
    if (!app.isPackaged) {
      this.setSnapshot("disabled", "Gelistirme modunda guncelleme devre disi");
      return { requested: false, reason: "DEV_MODE" };
    }

    if (this.installing) {
      return { requested: false, reason: "INSTALL_IN_PROGRESS" };
    }

    try {
      await this.checkForUpdatesWithTimeout(30_000);
      return { requested: true };
    } catch (error) {
      this.handleUpdaterError(error);
      return { requested: false, reason: "CHECK_FAILED" };
    }
  }

  public async installDownloadedUpdate(): Promise<InstallUpdateResponse> {
    if (!app.isPackaged) {
      return { accepted: false, reason: "DEV_MODE" };
    }

    if (this.installing) {
      return { accepted: false, reason: "INSTALL_IN_PROGRESS" };
    }

    if (this.snapshot.phase !== "downloaded") {
      return { accepted: false, reason: "UPDATE_NOT_READY" };
    }

    this.installing = true;
    this.setSnapshot(
      "installing",
      "Guncelleme kuruluyor, uygulama yeniden baslatilacak",
    );

    const helperLaunched = this.launchUpdaterHelperProcess();
    if (!helperLaunched) {
      this.showUpdaterWindow();
      this.setUpdaterWindowState("Ana uygulama kapatiliyor...");
      this.hideMainWindowsForInstall();
    }

    try {
      await this.options.beforeInstall();
    } catch {
      // Best-effort pre-install cleanup.
    }

    if (helperLaunched) {
      this.setSnapshot(
        "installing",
        "Updater yardimci sureci baslatildi, uygulama kapatiliyor",
      );

      setTimeout(() => {
        app.exit(0);
      }, 250);

      return { accepted: true };
    }

    this.setUpdaterWindowState(
      "Guncelleme otomatik kuruluyor. Kurulum bitince uygulama tekrar acilacak.",
    );

    setTimeout(() => {
      this.triggerQuitAndInstall();
    }, 1200);

    return { accepted: true };
  }

  private bindListeners(): void {
    if (this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    autoUpdater.on("checking-for-update", () => {
      this.setSnapshot("checking", "Yeni surum kontrol ediliyor");
    });

    autoUpdater.on("update-available", (info) => {
      this.setSnapshotFromInfo(
        "available",
        info,
        "Yeni bir surum bulundu, indiriliyor",
      );
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setSnapshotFromProgress(progress);
      if (this.installing) {
        this.setUpdaterWindowState(
          "Guncelleme paketi indiriliyor...",
          Number.isFinite(progress.percent)
            ? Math.max(0, Math.min(100, Number(progress.percent.toFixed(2))))
            : null,
        );
      }
    });

    autoUpdater.on("update-downloaded", async (info) => {
      this.setSnapshotFromInfo(
        "downloaded",
        info,
        "Guncelleme indirildi, kurulum icin hazir",
      );
      await this.promptInstallDialog(info);
    });

    autoUpdater.on("update-not-available", (info) => {
      this.setSnapshotFromInfo("not-available", info, "Bu surum guncel");
    });

    autoUpdater.on("error", (error) => {
      this.handleUpdaterError(error);
    });
  }

  private scheduleChecks(): void {
    const startupCheckDelayMs =
      this.options.startupCheckDelayMs ?? defaultStartupCheckDelayMs;
    const periodicCheckMs =
      this.options.periodicCheckMs ?? defaultPeriodicCheckMs;

    this.startupCheckTimer = setTimeout(() => {
      void this.checkForUpdates();
    }, startupCheckDelayMs);

    if (this.startupCheckTimer.unref) {
      this.startupCheckTimer.unref();
    }

    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates();
    }, periodicCheckMs);

    if (this.periodicTimer.unref) {
      this.periodicTimer.unref();
    }
  }

  private async promptInstallDialog(info: UpdateInfo): Promise<void> {
    if (this.promptingForInstall || this.installing) {
      return;
    }

    this.promptingForInstall = true;
    const version =
      info.version?.trim() || this.snapshot.nextVersion || "unknown";

    try {
      const result = await dialog.showMessageBox({
        type: "info",
        title: "Connect guncellemesi hazir",
        message: `v${version} indirildi. Simdi guncellemek ister misin?`,
        detail:
          "Guncelle dediginde uygulama otomatik kapanir, guncellenir ve yeniden acilir.",
        buttons: ["Guncelle", "Daha Sonra"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (result.response === 0) {
        await this.installDownloadedUpdate();
      }
    } finally {
      this.promptingForInstall = false;
    }
  }

  private handleUpdaterError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Beklenmeyen guncelleme hatasi";

    this.setSnapshot("error", message);
    if (this.installing) {
      this.setUpdaterWindowState(`Guncelleme hatasi: ${message}`);
      this.installing = false;
      this.restoreMainWindowsAfterInstallFailure();
      if (this.snapshot.nextVersion) {
        this.setSnapshot(
          "downloaded",
          "Kurulum basarisiz oldu. Tekrar denemek icin Guncelle secenegini kullan.",
        );
      }
    }

    const event: AppUpdateEvent = {
      type: "update-error",
      state: { ...this.snapshot },
      errorCode: "UPDATER_ERROR",
      errorMessage: message,
    };
    this.broadcast(event);
  }

  private setSnapshotFromInfo(
    phase: AppUpdatePhase,
    info: UpdateInfo,
    message: string,
  ): void {
    this.snapshot = {
      ...this.snapshot,
      phase,
      nextVersion: info.version ?? this.snapshot.nextVersion,
      releaseName: info.releaseName ?? this.snapshot.releaseName,
      releaseDate: info.releaseDate ?? this.snapshot.releaseDate,
      progressPercent:
        phase === "downloaded" ? 100 : this.snapshot.progressPercent,
      message,
      timestamp: new Date().toISOString(),
    };

    this.emitState();
  }

  private setSnapshotFromProgress(progress: ProgressInfo): void {
    const percent = Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, Number(progress.percent.toFixed(2))))
      : null;

    this.snapshot = {
      ...this.snapshot,
      phase: "downloading",
      progressPercent: percent,
      message:
        percent == null
          ? "Guncelleme indiriliyor"
          : `Guncelleme indiriliyor (%${percent})`,
      timestamp: new Date().toISOString(),
    };

    this.emitState();
  }

  private setSnapshot(phase: AppUpdatePhase, message: string): void {
    this.snapshot = {
      ...this.snapshot,
      phase,
      message,
      timestamp: new Date().toISOString(),
    };

    if (phase !== "downloading") {
      this.snapshot.progressPercent = null;
    }

    this.emitState();
  }

  private emitState(): void {
    const event: AppUpdateEvent = {
      type: "update-state",
      state: { ...this.snapshot },
    };
    this.broadcast(event);
  }

  private showUpdaterWindow(): void {
    if (this.updaterWindow && !this.updaterWindow.isDestroyed()) {
      if (!this.updaterWindow.isVisible()) {
        this.updaterWindow.show();
      }
      this.updaterWindow.focus();
      return;
    }

    this.updaterWindowLoaded = false;

    const win = new BrowserWindow({
      width: 540,
      height: 340,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      title: "Connect Updater",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.updaterWindow = win;

    win.on("closed", () => {
      this.updaterWindow = null;
      this.updaterWindowLoaded = false;
      this.pendingUpdaterWindowState = null;
    });

    win.webContents.on("did-finish-load", () => {
      this.updaterWindowLoaded = true;
      this.flushUpdaterWindowState();
    });

    const html = createUpdaterWindowHtml();
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    void win.loadURL(dataUrl).catch((error) => {
      this.handleUpdaterError(error);
    });

    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) {
        win.show();
        win.focus();
        this.flushUpdaterWindowState();
      }
    });
  }

  private async checkForUpdatesWithTimeout(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Update check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (timeout.unref) {
        timeout.unref();
      }

      void autoUpdater
        .checkForUpdates()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private triggerQuitAndInstall(): void {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      this.handleUpdaterError(error);
    }
  }

  private launchUpdaterHelperProcess(): boolean {
    if (!app.isPackaged) {
      return false;
    }

    const versionLabel =
      this.snapshot.nextVersion ?? this.snapshot.currentVersion ?? "unknown";

    const args = [
      "--ct-updater-helper",
      `--ct-updater-parent-pid=${process.pid}`,
      `--ct-updater-version=${versionLabel}`,
    ];

    try {
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });

      child.unref();
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Updater helper process could not be started";
      console.error(`[updater] helper launch failed: ${message}`);
      return false;
    }
  }

  private setUpdaterWindowState(
    message: string,
    progressPercent: number | null = null,
  ): void {
    const versionLabel =
      this.snapshot.nextVersion ?? this.snapshot.currentVersion ?? "unknown";

    this.pendingUpdaterWindowState = {
      title: `Connect Updater v${versionLabel}`,
      message,
      progressPercent,
      phase: this.snapshot.phase,
    };

    this.flushUpdaterWindowState();
  }

  private flushUpdaterWindowState(): void {
    if (!this.pendingUpdaterWindowState) {
      return;
    }

    const win = this.updaterWindow;
    if (!win || win.isDestroyed() || !this.updaterWindowLoaded) {
      return;
    }

    const nextState = this.pendingUpdaterWindowState;
    this.pendingUpdaterWindowState = null;

    const script = `window.__connectUpdaterSetState && window.__connectUpdaterSetState(${JSON.stringify(nextState)});`;

    void win.webContents.executeJavaScript(script, true).catch(() => {
      // Window might be closing while installing.
    });
  }

  private hideMainWindowsForInstall(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) {
        continue;
      }

      if (this.updaterWindow && win === this.updaterWindow) {
        continue;
      }

      win.hide();
    }
  }

  private restoreMainWindowsAfterInstallFailure(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) {
        continue;
      }

      if (this.updaterWindow && win === this.updaterWindow) {
        continue;
      }

      win.show();
    }
  }

  private broadcast(event: AppUpdateEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        continue;
      }

      win.webContents.send(UPDATE_EVENT_CHANNEL, event);
    }
  }
}

let sharedUpdater: ModularUpdater | null = null;

const getUpdater = (): ModularUpdater => {
  if (!sharedUpdater) {
    throw new Error("Updater has not been initialized");
  }

  return sharedUpdater;
};

export const initializeModularUpdater = (
  options: ModularUpdaterOptions,
): void => {
  if (!sharedUpdater) {
    sharedUpdater = new ModularUpdater(options);
  }

  sharedUpdater.initialize();
};

export const checkForAppUpdates =
  async (): Promise<CheckForUpdatesResponse> => {
    return getUpdater().checkForUpdates();
  };

export const installDownloadedAppUpdate =
  async (): Promise<InstallUpdateResponse> => {
    return getUpdater().installDownloadedUpdate();
  };

export const getAppUpdateSnapshot = (): AppUpdateSnapshot => {
  return getUpdater().getSnapshot();
};

export const destroyModularUpdater = (): void => {
  if (!sharedUpdater) {
    return;
  }

  sharedUpdater.destroy();
};
