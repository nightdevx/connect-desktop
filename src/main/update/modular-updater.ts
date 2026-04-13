import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

const resolveLogoDataUrl = (): string | null => {
  const candidates = [
    join(__dirname, "../../public/images/logo.png"),
    join(app.getAppPath(), "public/images/logo.png"),
    join(app.getAppPath(), "dist/public/images/logo.png"),
    join(process.resourcesPath, "public/images/logo.png"),
    join(process.resourcesPath, "images/logo.png"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const raw = readFileSync(candidate);
      return `data:image/png;base64,${raw.toString("base64")}`;
    } catch {
      // Try next candidate path.
    }
  }

  return null;
};

const createUpdaterWindowHtml = (logoDataUrl: string | null): string => {
  const logoMarkup = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Connect logo" />`
    : `<div class="brand-fallback">CT</div>`;

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect Updater</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-top: #0b1120;
        --bg-mid: #111a31;
        --bg-bottom: #090f1f;
        --accent-a: #3b82f6;
        --accent-b: #60a5fa;
        --text-main: #e2e8f0;
        --text-soft: #cbd5e1;
        --text-muted: #94a3b8;
        --surface: rgba(24, 31, 54, 0.9);
        --surface-soft: rgba(15, 23, 42, 0.72);
        --border: rgba(148, 163, 184, 0.26);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      * {
        box-sizing: border-box;
        user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        min-height: 100%;
        overflow: hidden;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 8% 14%, rgba(52, 211, 153, 0.2), transparent 44%),
          radial-gradient(circle at 86% 80%, rgba(56, 189, 248, 0.26), transparent 42%),
          linear-gradient(165deg, var(--bg-top) 0%, var(--bg-mid) 50%, var(--bg-bottom) 100%);
        color: var(--text-main);
      }
      .card {
        width: min(520px, calc(100vw - 32px));
        max-height: calc(100vh - 24px);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 20px 20px 18px;
        background: linear-gradient(165deg, var(--surface), rgba(11, 16, 32, 0.96));
        box-shadow:
          0 20px 44px rgba(2, 6, 23, 0.56),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        overflow: hidden;
        animation: lift 420ms ease-out both;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand-mark {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.9);
        box-shadow: 0 8px 16px rgba(2, 6, 23, 0.5);
        overflow: hidden;
      }
      .brand-mark img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .brand-fallback {
        color: #dbeafe;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .title-wrap {
        display: grid;
        gap: 2px;
      }
      .sub {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #99cee8;
      }
      .title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .status {
        margin-top: 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-soft);
        background: var(--surface-soft);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 5px 10px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #3b82f6;
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
        animation: pulse 1.5s ease-out infinite;
      }
      .message {
        margin-top: 14px;
        color: #d3edf9;
        line-height: 1.45;
        min-height: 46px;
      }
      .progress-wrap {
        margin-top: 16px;
      }
      .progress {
        position: relative;
        width: 100%;
        height: 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(30, 41, 59, 0.7);
        overflow: hidden;
      }
      .progress::after {
        content: "";
        position: absolute;
        top: 0;
        left: -45%;
        width: 40%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: sweep 1.9s linear infinite;
        pointer-events: none;
      }
      .bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
        transition: width 160ms ease;
      }
      .percent {
        margin-top: 7px;
        font-size: 12px;
        color: var(--text-soft);
        letter-spacing: 0.02em;
      }
      .steps {
        margin: 16px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .step {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 6px;
        text-align: center;
        font-size: 11px;
        color: var(--text-muted);
        background: rgba(30, 41, 59, 0.48);
      }
      .step.is-active {
        color: #eff6ff;
        border-color: rgba(59, 130, 246, 0.8);
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.28) inset;
      }
      .step.is-done {
        color: #dbeafe;
        border-color: rgba(96, 165, 250, 0.9);
      }
      .step.is-error {
        color: #ffd2d2;
        border-color: rgba(248, 113, 113, 0.9);
      }
      .hint {
        margin: 14px 0 0;
        font-size: 11px;
        color: var(--text-muted);
      }
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55);
        }
        100% {
          box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
        }
      }
      @keyframes sweep {
        to {
          left: 120%;
        }
      }
      @keyframes lift {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.99);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <header class="head">
        <div class="brand-mark">${logoMarkup}</div>
        <div class="title-wrap">
          <span class="sub">Connect Together</span>
          <h1 class="title" id="title">Desktop Updater</h1>
        </div>
      </header>
      <div class="status"><span class="status-dot"></span><span>Güncelleme servisi etkin</span></div>

      <p class="message" id="message">Güncelleme hazırlanıyor...</p>

      <ul class="steps">
        <li class="step" id="step-check">Kontrol</li>
        <li class="step" id="step-download">İndir</li>
        <li class="step" id="step-install">Kur</li>
        <li class="step" id="step-relaunch">Yeniden Aç</li>
      </ul>

      <div class="progress-wrap" id="progress-wrap">
        <div class="progress"><div class="bar" id="bar"></div></div>
        <div class="percent" id="percent">Bekleniyor</div>
      </div>

      <p class="hint">Kurulum otomatik yapılır. Kullanıcı adımı gerekmez.</p>
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
    message: "Güncelleme henüz kontrol edilmedi",
    timestamp: new Date().toISOString(),
  };

  public constructor(private readonly options: ModularUpdaterOptions) {}

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!app.isPackaged) {
      this.setSnapshot("disabled", "Geliştirme modunda güncelleme devre dışı");
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
      this.setSnapshot("disabled", "Geliştirme modunda güncelleme devre dışı");
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
      "Güncelleyici yardımcı uygulaması başlatılıyor",
    );

    const helperLaunched = this.launchUpdaterHelperProcess();
    if (!helperLaunched) {
      this.installing = false;
      this.setSnapshot(
        "error",
        "Güncelleyici yardımcı uygulaması başlatılamadı. Lütfen tekrar deneyin.",
      );
      return { accepted: false, reason: "HELPER_LAUNCH_FAILED" };
    }

    try {
      await this.options.beforeInstall();
    } catch {
      // Best-effort pre-install cleanup.
    }

    this.setSnapshot(
      "installing",
      "Güncelleyici yardımcı süreci çalışıyor, uygulama kapatılıyor",
    );
    this.hideMainWindowsForInstall();

    setTimeout(() => {
      app.exit(0);
    }, 1200);

    return { accepted: true };
  }

  private bindListeners(): void {
    if (this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    autoUpdater.on("checking-for-update", () => {
      this.setSnapshot("checking", "Yeni sürüm kontrol ediliyor");
    });

    autoUpdater.on("update-available", (info) => {
      this.setSnapshotFromInfo(
        "available",
        info,
        "Yeni bir sürüm bulundu, indiriliyor",
      );
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setSnapshotFromProgress(progress);
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setSnapshotFromInfo(
        "downloaded",
        info,
        "Güncelleme indirildi, kurulum için hazır",
      );

      if (!this.installing) {
        void this.installDownloadedUpdate();
      }
    });

    autoUpdater.on("update-not-available", (info) => {
      this.setSnapshotFromInfo("not-available", info, "Bu sürüm güncel");
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

  private handleUpdaterError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Beklenmeyen güncelleme hatası";

    this.setSnapshot("error", message);
    if (this.installing) {
      this.installing = false;
      this.restoreMainWindowsAfterInstallFailure();
      if (this.snapshot.nextVersion) {
        this.setSnapshot(
          "downloaded",
          "Kurulum başarısız oldu. Tekrar denemek için Güncelle seçeneğini kullan.",
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
          ? "Güncelleme indiriliyor"
          : `Güncelleme indiriliyor (%${percent})`,
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
      frame: false,
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

    const html = createUpdaterWindowHtml(resolveLogoDataUrl());
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
        windowsHide: false,
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
