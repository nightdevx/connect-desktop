import { execFile } from "node:child_process";
import { getDesktopAppPreferences, onDesktopAppPreferencesChanged } from "./app-preferences";
import { backendClient, getSessionStore, withAccessToken } from "./ipc/context";
import {
  isMinecraftWindowTitle,
  matchKnownGame,
  normalizeProcessName,
  type GameActivity,
} from "../shared/game-activity";

const POLL_INTERVAL_MS = 20_000;
const STARTUP_DELAY_MS = 10_000;
const REPUBLISH_INTERVAL_MS = 5 * 60_000;
const PROCESS_LIST_TIMEOUT_MS = 8_000;
const PROCESS_LIST_MAX_BUFFER = 8 * 1024 * 1024;

let startupTimer: NodeJS.Timeout | null = null;
let periodicTimer: NodeJS.Timeout | null = null;
let unsubscribePreferences: (() => void) | null = null;
let current: GameActivity | null = null;
let publishedAtMs = 0;
let inFlight = false;

const runCommand = (command: string, args: string[]): Promise<string> => {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: PROCESS_LIST_TIMEOUT_MS,
        maxBuffer: PROCESS_LIST_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout) => {
        resolve(error ? "" : stdout);
      },
    );
  });
};

const parseTasklistCsv = (stdout: string): string[] => {
  const names: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"([^"]*)"/.exec(line);
    if (match?.[1]) {
      names.push(match[1]);
    }
  }
  return names;
};

const parsePsArgs = (stdout: string): string[] => {
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const first = line.trim().split(/\s+/)[0];
    if (first) {
      names.push(first);
    }
  }
  return names;
};

const listProcessNames = async (): Promise<string[]> => {
  if (process.platform === "win32") {
    return parseTasklistCsv(await runCommand("tasklist", ["/FO", "CSV", "/NH"]));
  }

  if (process.platform === "linux") {
    return parsePsArgs(await runCommand("ps", ["-eo", "args="]));
  }

  return [];
};

// The window titles of running javaw.exe processes: the last CSV column of the
// verbose listing, "N/A" for a process without a window. Asked only while a
// javaw.exe runs, since /V is the slow form of tasklist.
const listJavaWindowTitles = async (): Promise<string[]> => {
  const stdout = await runCommand("tasklist", [
    "/V",
    "/FO",
    "CSV",
    "/NH",
    "/FI",
    "IMAGENAME eq javaw.exe",
  ]);
  const titles: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /"([^"]*)"\s*$/.exec(line);
    if (match?.[1]) {
      titles.push(match[1]);
    }
  }
  return titles;
};

const detectGame = async (): Promise<string | null> => {
  const names = await listProcessNames();
  const known = matchKnownGame(names);
  if (
    known ||
    process.platform !== "win32" ||
    !names.some((name) => normalizeProcessName(name) === "javaw")
  ) {
    return known;
  }
  return (await listJavaWindowTitles()).some(isMinecraftWindowTitle) ? "Minecraft" : null;
};

const isSameActivity = (
  a: GameActivity | null,
  b: GameActivity | null,
): boolean => {
  if (!a || !b) {
    return a === b;
  }
  return a.name === b.name && a.startedAt === b.startedAt;
};

const publish = async (activity: GameActivity | null): Promise<void> => {
  await withAccessToken((accessToken) =>
    backendClient.auth.setActivity(accessToken, activity),
  );
  current = activity;
  publishedAtMs = Date.now();
};

const clearActivity = (): void => {
  if (current === null) {
    return;
  }

  const previous = current;
  current = null;
  publishedAtMs = 0;

  if (!getSessionStore().get()) {
    return;
  }

  void publish(null).catch(() => {
    current = previous;
    publishedAtMs = 0;
  });
};

const runPoll = async (): Promise<void> => {
  if (inFlight) {
    return;
  }

  if (!getSessionStore().get() || !getDesktopAppPreferences().shareGameActivity) {
    current = null;
    publishedAtMs = 0;
    return;
  }

  inFlight = true;
  try {
    const title = await detectGame();
    const next: GameActivity | null = title
      ? {
          name: title,
          startedAt:
            current?.name === title
              ? current.startedAt
              : new Date().toISOString(),
        }
      : null;

    const isStale = Date.now() - publishedAtMs >= REPUBLISH_INTERVAL_MS;
    if (isSameActivity(current, next) && !(next && isStale)) {
      return;
    }

    await publish(next);
  } catch {
    publishedAtMs = 0;
  } finally {
    inFlight = false;
  }
};

export const startGameActivityPoller = (): void => {
  if (startupTimer || periodicTimer) {
    return;
  }

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runPoll();
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();

  periodicTimer = setInterval(() => {
    void runPoll();
  }, POLL_INTERVAL_MS);
  periodicTimer.unref?.();

  unsubscribePreferences = onDesktopAppPreferencesChanged((preferences) => {
    if (preferences.shareGameActivity) {
      void runPoll();
      return;
    }

    clearActivity();
  });
};

export const stopGameActivityPoller = (): void => {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }

  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }

  unsubscribePreferences?.();
  unsubscribePreferences = null;
  current = null;
  publishedAtMs = 0;
};
