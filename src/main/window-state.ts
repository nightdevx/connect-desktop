// Rules for the main window that need no Electron: where it reopens, when a
// crashed page is reloaded and when a page counts as frozen. Kept import-free
// so scripts/check-desktop-shell.cjs can run them under plain Node.

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindowState {
  bounds: WindowRect;
  isMaximized: boolean;
}

// The page's own title bar (--ct-titlebar-height): the part of the window that
// has to land on a screen for the user to be able to drag it.
const TITLEBAR_HEIGHT = 48;
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 32;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readRect = (value: unknown): WindowRect | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
};

const overlap = (a: WindowRect, b: WindowRect): { width: number; height: number } => ({
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

/**
 * The saved window state, if it still fits the screens attached now; null means
 * open at the default size, centred.
 *
 * A window saved on a second monitor that has since been unplugged, or on a
 * laptop that now runs at a lower resolution, would otherwise open somewhere
 * nobody can see or reach. It is kept only while enough of its title bar lies on
 * one display's work area to grab, and is shrunk to fit that display.
 */
export const restoreWindowState = (
  saved: unknown,
  workAreas: WindowRect[],
  minSize: { width: number; height: number },
): SavedWindowState | null => {
  if (!saved || typeof saved !== "object") {
    return null;
  }
  const record = saved as Record<string, unknown>;
  const bounds = readRect(record.bounds);
  if (!bounds) {
    return null;
  }

  const titleBar = { ...bounds, height: TITLEBAR_HEIGHT };
  const area = workAreas.find((candidate) => {
    const visible = overlap(titleBar, candidate);
    return visible.width >= MIN_VISIBLE_WIDTH && visible.height >= MIN_VISIBLE_HEIGHT;
  });
  if (!area) {
    return null;
  }

  return {
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(minSize.width, Math.min(bounds.width, area.width)),
      height: Math.max(minSize.height, Math.min(bounds.height, area.height)),
    },
    isMaximized: record.isMaximized === true,
  };
};

/**
 * Decides, crash by crash, whether a page that died should be reloaded. A page
 * that crashes on load would otherwise reload forever, pinning a core and
 * flashing the window; the third crash inside the window stops it.
 */
export const createCrashLoopGuard = (
  limit = 3,
  windowMs = 60_000,
): ((now: number) => boolean) => {
  const crashes: number[] = [];
  return (now) => {
    while (crashes.length > 0 && now - crashes[0] > windowMs) {
      crashes.shift();
    }
    crashes.push(now);
    return crashes.length < limit;
  };
};

// The preload's two beats, each about once a second: "timer" from a timer,
// "frame" from the animation frame that timer asks for.
export type PageBeat = "timer" | "frame";

// "busy": the page's thread runs no tasks, so no timer fires. "drawing": timers
// fire but no frame is drawn, so the screen stays as it was.
export type PageStall = "busy" | "drawing";

export type FreezeEvent =
  | { type: "froze"; stall: PageStall }
  | { type: "recovered"; stall: PageStall; ms: number }
  | { type: "reload"; stall: PageStall; ms: number };

export interface FreezeWatch {
  beat: (kind: PageBeat, now: number) => void;
  /** A click or key press sent to the page. */
  input: (now: number) => void;
  /**
   * One look, about once a second. canDraw: the window is shown and not
   * minimised, so frames are due.
   */
  check: (now: number, canDraw: boolean) => FreezeEvent | null;
  reset: (now: number) => void;
}

/**
 * Tells a frozen page from a quiet one.
 *
 * Chromium's own hang report (page-recovery.ts) needs an input event left
 * unanswered for about 15 s, and every late answer starts that count over, so a
 * page that answers one click in twenty seconds is never reported. Users saw
 * exactly that: the stream kept playing, nothing else moved, and only closing
 * the app ended it.
 *
 * A beat that stops counts only once the user has clicked or typed since it
 * stopped: a hidden, minimised or covered window is not frozen, just unseen.
 * A look that comes late (main itself was held up, or the machine slept)
 * starts over, since the beats may still be queued behind it.
 */
export const createFreezeWatch = ({
  reportAfterMs = 5_000,
  reloadAfterMs = 20_000,
  checkEveryMs = 1_000,
} = {}): FreezeWatch => {
  const lastBeat: Record<PageBeat, number> = { timer: 0, frame: 0 };
  let lastInput = Number.NEGATIVE_INFINITY;
  let lastCheck: number | null = null;
  let episode: { stall: PageStall; since: number } | null = null;

  const reset = (now: number): void => {
    lastBeat.timer = now;
    lastBeat.frame = now;
    lastCheck = now;
    episode = null;
  };

  return {
    beat: (kind, now) => {
      lastBeat[kind] = now;
    },
    input: (now) => {
      lastInput = now;
    },
    check: (now, canDraw) => {
      if (lastCheck === null || now - lastCheck > checkEveryMs * 3) {
        reset(now);
        return null;
      }
      lastCheck = now;
      if (!canDraw) {
        lastBeat.frame = now;
      }

      const stall: PageStall | null =
        now - lastBeat.timer >= reportAfterMs
          ? "busy"
          : now - lastBeat.frame >= reportAfterMs
            ? "drawing"
            : null;

      if (episode) {
        const ms = now - episode.since;
        if (!stall) {
          const ended = episode.stall;
          episode = null;
          return { type: "recovered", stall: ended, ms };
        }
        if (ms >= reloadAfterMs) {
          const ended = episode.stall;
          reset(now);
          return { type: "reload", stall: ended, ms };
        }
        return null;
      }

      if (stall) {
        const since = lastBeat[stall === "busy" ? "timer" : "frame"];
        if (lastInput > since) {
          episode = { stall, since };
          return { type: "froze", stall };
        }
      }
      return null;
    },
    reset,
  };
};
