import type { DesktopResult } from "@shared/desktop-api-types";
import type { MinigameLeaderboard, MinigameScoreMap } from "@shared/minigames";

/**
 * The bridge, for records and boards.
 *
 * A packaged app can run a newer renderer against an older preload, so every
 * bridge method is feature-detected rather than assumed. Resolving a result is
 * the house convention; throwing here would surface as an unhandled rejection
 * instead of a message the user can act on.
 */
const desktopBridgeOutdatedError = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaüstü API'si güncel değil. Uygulamayı tamamen kapatıp yeniden başlatın.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

export const scoreService = {
  /** Every solo game this account holds a record at. */
  listScores: (): Promise<DesktopResult<{ scores: MinigameScoreMap }>> => {
    if (typeof window.desktopApi.listMinigameScores !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ scores: MinigameScoreMap }>,
      );
    }

    return window.desktopApi.listMinigameScores();
  },

  /**
   * Records a finished run. The server keeps it only if it beats what is
   * stored, so calling this with a score that loses is free and correct.
   */
  submitScore: (
    game: string,
    score: number,
  ): Promise<DesktopResult<{ updated: boolean; game: string; best: number }>> => {
    if (typeof window.desktopApi.submitMinigameScore !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          updated: boolean;
          game: string;
          best: number;
        }>,
      );
    }

    return window.desktopApi.submitMinigameScore({ game, score });
  },

  leaderboard: (
    game: string,
    limit?: number,
  ): Promise<DesktopResult<MinigameLeaderboard>> => {
    if (typeof window.desktopApi.getMinigameLeaderboard !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<MinigameLeaderboard>,
      );
    }

    return window.desktopApi.getMinigameLeaderboard({ game, limit });
  },
};
