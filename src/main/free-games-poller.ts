import { BrowserWindow } from "electron";
import { fetchFreeGames } from "./clients/free-games-client";
import { showDesktopNotification } from "./notifications";
import { getSessionStore } from "./ipc/context";
import {
  findNewlyFree,
  mergeOffers,
  type FreeGameOffer,
  type FreeGameSource,
  type FreeGamesSnapshot,
} from "../shared/free-games";

// Keeps the free-games page current without the renderer having to ask.
//
// Modelled on the updater's scheduler (src/main/update/modular-updater.ts): a
// delayed first check so it does not compete with the login round trip, then a
// plain interval, both unref'd so neither keeps the process alive, and the
// result broadcast to every window rather than returned to one.
//
// Living in main rather than in a renderer hook is what makes "anlık" true when
// the window is in the tray: the poll keeps running, and a giveaway that starts
// while the app is minimised raises its toast then, not when the user next
// opens the page.

export const FREE_GAMES_EVENT_CHANNEL = "desktop:free-games-updated";

// Epic rotates its weekly giveaway at 15:00 UTC and GamerPower caches its own
// answer for 10 minutes, so a faster poll only costs requests. 15 minutes puts
// the worst-case lag well inside the hour that matters for a week-long offer.
const POLL_INTERVAL_MS = 15 * 60_000;

// Long enough to be behind the session restore and the first lobby sync, short
// enough that the page has data before anyone navigates to it.
const STARTUP_DELAY_MS = 8_000;

// A snapshot younger than this answers a renderer request outright. Opening the
// page, leaving it and coming back must not spend four requests.
const SNAPSHOT_FRESH_MS = 5 * 60_000;

// Floor under a manual refresh. The button is in the renderer, so the limit
// lives here, where a render loop cannot reach past it.
const MANUAL_REFRESH_COOLDOWN_MS = 60_000;

// At most this many titles are named in one toast before it becomes a count.
const NOTIFICATION_TITLE_LIMIT = 2;

let snapshot: FreeGamesSnapshot | null = null;
let fetchedAtMs = 0;
let inFlight: Promise<FreeGamesSnapshot> | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let periodicTimer: NodeJS.Timeout | null = null;

/**
 * The last thing each source successfully said.
 *
 * This is what keeps a blip from becoming a notification storm. The snapshot
 * used to be rebuilt from whatever answered THIS round, so one GamerPower
 * timeout dropped every Steam and GOG giveaway out of the baseline — and the
 * next round, when it answered again, every one of them looked brand new and
 * the user got "12 yeni ücretsiz oyun" for giveaways that had been running for
 * days. Carrying the last good answer forward means a failed source changes
 * nothing except the warning in the sidebar.
 */
const lastGoodBySource = new Map<FreeGameSource, FreeGameOffer[]>();

// The first successful poll finds a page full of giveaways that have been
// running for days. Announcing all of them would be a wall of toasts about
// nothing that just happened.
let hasAnnouncedOnce = false;

const broadcast = (payload: FreeGamesSnapshot): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(FREE_GAMES_EVENT_CHANNEL, payload);
    }
  }
};

const announce = (previous: FreeGamesSnapshot | null, next: FreeGamesSnapshot): void => {
  if (!hasAnnouncedOnce) {
    // Armed by the first round that actually produced offers, not merely by the
    // first round. A launch with no network answers nothing, and arming on that
    // would make the NEXT round — the first real one — announce every giveaway
    // already running as brand new.
    hasAnnouncedOnce = next.offers.length > 0;
    return;
  }

  // Nobody is signed in, so there is no window that could act on the toast: the
  // click handler that opens the page lives in the workspace shell, which only
  // mounts behind an authenticated session.
  if (!getSessionStore().get()) {
    return;
  }

  const newly = findNewlyFree(previous?.offers ?? [], next.offers);
  if (newly.length === 0) {
    return;
  }

  const named = newly.slice(0, NOTIFICATION_TITLE_LIMIT).map((offer) => offer.title);
  const body =
    newly.length === 1
      ? `${newly[0].title} şu an ${newly[0].storeLabel} üzerinde ücretsiz.`
      : `${named.join(", ")}${newly.length > named.length ? ` ve ${newly.length - named.length} oyun daha` : ""} ücretsiz oldu.`;

  showDesktopNotification({
    kind: "free-game",
    title: newly.length === 1 ? "Yeni ücretsiz oyun" : `${newly.length} yeni ücretsiz oyun`,
    body,
  });
};

const runFetch = async (): Promise<FreeGamesSnapshot> => {
  // Single-flight. The poller's interval, the startup timer and a renderer
  // refresh can all land together; four sources times three callers is twelve
  // requests for one answer.
  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchFreeGames()
    .then((fetched) => {
      const failed = new Set(fetched.failedSources);

      // A source that answered replaces what it said last time; one that did
      // not keeps saying it. So a timeout costs the user the sidebar's warning
      // and nothing else — not a store's worth of missing cards, and not a
      // round of phantom "newly free" toasts when it comes back.
      for (const [source, offers] of Object.entries(fetched.offersBySource)) {
        if (!failed.has(source as FreeGameSource)) {
          lastGoodBySource.set(source as FreeGameSource, offers);
        }
      }

      const next: FreeGamesSnapshot = {
        offers: mergeOffers([...lastGoodBySource.values()]),
        fetchedAt: new Date().toISOString(),
        failedSources: fetched.failedSources,
      };

      announce(snapshot, next);
      snapshot = next;
      // Moves even on a completely failed round. Leaving it behind looked
      // harmless and meant the cooldown never applied while the network was
      // down — so the one moment the app should back off was the one where
      // every request retried on demand.
      fetchedAtMs = Date.now();
      return next;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * The current offers.
 *
 * `refresh` is the renderer's manual button; it still cannot poll faster than
 * the cooldown, and it falls back to the cached snapshot rather than erroring
 * when it is refused — the user pressed a button, they get the list.
 */
export const getFreeGames = async (
  options: { refresh?: boolean } = {},
): Promise<FreeGamesSnapshot> => {
  const now = Date.now();
  const age = now - fetchedAtMs;

  if (snapshot) {
    const cooling = options.refresh
      ? age < MANUAL_REFRESH_COOLDOWN_MS
      : age < SNAPSHOT_FRESH_MS;
    if (cooling) {
      return snapshot;
    }
  }

  const next = await runFetch();
  broadcast(next);
  return next;
};

/** Starts the background schedule. Idempotent. */
export const startFreeGamesPoller = (): void => {
  if (startupTimer || periodicTimer) {
    return;
  }

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runFetch()
      .then(broadcast)
      .catch(() => {
        // Nothing to recover: the snapshot stays null, the renderer's own
        // request will try again, and the next interval is 15 minutes away.
      });
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();

  periodicTimer = setInterval(() => {
    void runFetch()
      .then(broadcast)
      .catch(() => undefined);
  }, POLL_INTERVAL_MS);
  periodicTimer.unref?.();
};

/** Stops the schedule. Called on quit so a pending timer cannot fire into teardown. */
export const stopFreeGamesPoller = (): void => {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
};
