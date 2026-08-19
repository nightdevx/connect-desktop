import type { DesktopResult } from "@shared/desktop-api-types";
import type { FreeGamesSnapshot } from "@shared/free-games";

// A packaged app can run a newer renderer against an older preload, so every
// bridge method is feature-detected rather than assumed. Resolving a result is
// the house convention; throwing here would surface as an unhandled rejection
// inside react-query instead of a message the user can act on.
const desktopBridgeOutdatedError = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaüstü API'si güncel değil. Uygulamayı tamamen kapatıp yeniden başlatın.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

const EMPTY_SNAPSHOT: FreeGamesSnapshot = {
  offers: [],
  fetchedAt: new Date(0).toISOString(),
  failedSources: [],
};

export const freeGamesService = {
  /**
   * The current offers.
   *
   * `refresh` is the page's manual button. Main still applies its own cooldown
   * and answers from cache when it refuses, so pressing it twice is harmless.
   */
  getFreeGames: (
    payload: { refresh?: boolean } = {},
  ): Promise<DesktopResult<FreeGamesSnapshot>> => {
    if (typeof window.desktopApi.getFreeGames !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<FreeGamesSnapshot>,
      );
    }

    return window.desktopApi.getFreeGames(payload);
  },

  /** Pushes from the background poll. Returns an unsubscribe. */
  onFreeGamesUpdated: (
    listener: (snapshot: FreeGamesSnapshot) => void,
  ): (() => void) => {
    if (typeof window.desktopApi.onFreeGamesUpdated !== "function") {
      return () => undefined;
    }

    return window.desktopApi.onFreeGamesUpdated(listener);
  },
};

export { EMPTY_SNAPSHOT as EMPTY_FREE_GAMES_SNAPSHOT };
