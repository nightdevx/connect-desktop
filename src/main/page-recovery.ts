import { cpus } from "node:os";
import { app, type BrowserWindow } from "electron";
import * as Sentry from "@sentry/electron/main";
import { createCrashLoopGuard, createFreezeWatch, type FreezeEvent } from "./window-state";

// How long a page may stay hung after Chromium reports it unresponsive before
// it is killed and reloaded.
const HUNG_PAGE_KILL_MS = 10_000;

// The preload's beats (src/preload/index.ts) and how often they are looked at.
const PAGE_BEAT_CHANNEL = "desktop:page-beat";
const FREEZE_CHECK_MS = 1_000;

// What the machine looked like during a freeze, for the report. getAppMetrics
// measures each process's CPU from its previous call, and the first call is
// made when the freeze is first seen, so the CPU figures cover the freeze.
// Electron divides that CPU by the machine's thread count; multiplied back, 100
// is one core fully busy, which is what a page stuck on its thread shows (an
// endless loop measured 6 % on 16 threads).
const freezeContext = (win: BrowserWindow): Record<string, number | string | null> => {
  const metrics = app.getAppMetrics();
  const page = metrics.find((metric) => metric.pid === win.webContents.getOSProcessId());
  const gpu = metrics.find((metric) => metric.type === "GPU");
  const threads = cpus().length;
  const corePercent = (percent: number | undefined): number | null =>
    percent === undefined ? null : Math.round(percent * threads);
  const mb = (kb: number | undefined): number | null =>
    kb === undefined ? null : Math.round(kb / 1024);
  return {
    pageCpuCorePercent: corePercent(page?.cpu.percentCPUUsage),
    pageMemoryMb: mb(page?.memory.workingSetSize),
    pagePrivateMb: mb(page?.memory.privateBytes),
    gpuCpuCorePercent: corePercent(gpu?.cpu.percentCPUUsage),
    gpuMemoryMb: mb(gpu?.memory.workingSetSize),
    cpuThreads: threads,
    uptimeMinutes: Math.round(process.uptime() / 60),
    gpuCompositing: app.getGPUFeatureStatus().gpu_compositing ?? "unknown",
  };
};

const reportFreeze = (
  win: BrowserWindow,
  event: Exclude<FreezeEvent, { type: "froze" }>,
): void => {
  const context = freezeContext(win);
  const seconds = Math.round(event.ms / 1000);
  console.warn(
    `[window] page froze (${event.stall}) for ${seconds} s; ${event.type === "reload" ? "reloading" : "it came back"}`,
    context,
  );
  Sentry.captureMessage(`page froze (${event.stall})`, {
    level: "warning",
    fingerprint: ["page-froze", event.stall],
    tags: { stall: event.stall, outcome: event.type },
    extra: { seconds, ...context },
  });
};

// A dead page leaves a window with nothing in it, and since the window draws
// its own title bar, nothing to close it with either; with close-to-tray on,
// closing it only hid the dead page. So the page is reloaded, unless it keeps
// dying: then reloading would only loop.
//
// A page that is not dead but frozen while the user tries to use it (see
// createFreezeWatch) is reported, and reloaded the same way after 20 s.
export const installPageRecovery = (win: BrowserWindow): void => {
  const allowReload = createCrashLoopGuard();
  const watch = createFreezeWatch();
  let hungTimer: NodeJS.Timeout | null = null;

  win.webContents.on("render-process-gone", (_event, details) => {
    // Whatever killed it, the next page is judged on its own. A pending hang
    // kill must not land on that page either.
    watch.reset(performance.now());
    if (hungTimer) {
      clearTimeout(hungTimer);
      hungTimer = null;
    }
    if (details.reason === "clean-exit" || win.isDestroyed()) {
      return;
    }
    if (!allowReload(Date.now())) {
      console.error(
        `[window] page gone again (${details.reason}); stopped reloading after repeated crashes`,
      );
      return;
    }
    console.error(`[window] page gone (${details.reason}); reloading`);
    win.webContents.reload();
  });

  win.on("unresponsive", () => {
    console.warn("[window] page unresponsive");
    hungTimer ??= setTimeout(() => {
      hungTimer = null;
      if (!win.isDestroyed()) {
        // Reported as render-process-gone ("crashed" on Windows), which
        // reloads it.
        win.webContents.forcefullyCrashRenderer();
      }
    }, HUNG_PAGE_KILL_MS);
  });

  win.on("responsive", () => {
    if (hungTimer) {
      clearTimeout(hungTimer);
      hungTimer = null;
    }
  });

  win.webContents.ipc.on(PAGE_BEAT_CHANNEL, (_event, kind: unknown) => {
    if (kind === "timer" || kind === "frame") {
      watch.beat(kind, performance.now());
    }
  });

  win.webContents.on("input-event", (_event, input) => {
    if (input.type === "mouseDown" || input.type === "rawKeyDown" || input.type === "keyDown") {
      watch.input(performance.now());
    }
  });

  const freezeTimer = setInterval(() => {
    if (win.isDestroyed()) {
      return;
    }
    const now = performance.now();
    // A page stopped on a breakpoint is not frozen.
    if (win.webContents.isDevToolsOpened()) {
      watch.reset(now);
      return;
    }
    const event = watch.check(now, win.isVisible() && !win.isMinimized());
    if (!event) {
      return;
    }
    if (event.type === "froze") {
      console.warn(`[window] page froze (${event.stall})`);
      // Starts the CPU measurement freezeContext reads at the end.
      app.getAppMetrics();
      return;
    }
    reportFreeze(win, event);
    if (event.type === "reload") {
      // Reported as render-process-gone, which reloads it.
      win.webContents.forcefullyCrashRenderer();
    }
  }, FREEZE_CHECK_MS);

  win.on("closed", () => {
    clearInterval(freezeTimer);
    if (hungTimer) {
      clearTimeout(hungTimer);
    }
  });
};
