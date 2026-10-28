// Rules for the main window that need no Electron: where it reopens, and when a
// crashed page is reloaded. Kept import-free so scripts/check-window-shell.cjs
// can run them under plain Node.

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
