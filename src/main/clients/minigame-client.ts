import type { BaseClient } from "./base-client";
import type {
  MinigameLeaderboard,
  MinigameScoreMap,
  MinigameTable,
} from "../../shared/minigames";

/**
 * The two-player games, and the records the solo ones keep.
 *
 * Its own client rather than a corner of LobbyClient, mirroring the backend
 * split: a game table is its own lobby and belongs to no voice room, so nothing
 * here takes a lobby id and nothing here should be reachable from code that is
 * reasoning about rooms.
 */
export class MinigameClient {
  public constructor(private readonly baseClient: BaseClient) {}

  // Tables are public by design — the list IS the lobby browser — so this
  // filters nothing and needs no room. What a table exposes is a game, up to
  // two display names and a board.
  public async listTables(accessToken: string): Promise<{ tables: MinigameTable[] }> {
    return this.baseClient.request<{ tables: MinigameTable[] }>(`/minigame/tables`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  // One POST for open, join, move, restart and leave. Every rule — seating,
  // turn order, cell legality — is enforced server-side, so nothing here has to
  // know what the games are.
  public async play(
    accessToken: string,
    body: {
      action: "open" | "join" | "move" | "restart" | "leave";
      game?: string;
      tableId?: string;
      cell?: number;
      move?: string;
    },
  ): Promise<{ table: MinigameTable | null }> {
    return this.baseClient.request<{ table: MinigameTable | null }>(`/minigame/tables`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  // --- records ---------------------------------------------------------------

  /** Every solo game this account holds a record at. */
  public async listScores(accessToken: string): Promise<{ scores: MinigameScoreMap }> {
    return this.baseClient.request<{ scores: MinigameScoreMap }>(`/minigame/scores`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Records a finished run.
   *
   * Idempotent: the server keeps the score only if it beats what is stored, so
   * re-sending a local record costs nothing — which is what lets the desktop
   * catch up whatever was earned while the backend was unreachable.
   */
  public async submitScore(
    accessToken: string,
    game: string,
    score: number,
  ): Promise<{ updated: boolean; game: string; best: number }> {
    return this.baseClient.request<{ updated: boolean; game: string; best: number }>(
      `/minigame/scores`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ game, score }),
      },
    );
  }

  /** One game ranked, plus the caller's own place in it. */
  public async leaderboard(
    accessToken: string,
    game: string,
    limit?: number,
  ): Promise<MinigameLeaderboard> {
    const query = limit ? `?limit=${limit}` : "";
    return this.baseClient.request<MinigameLeaderboard>(
      `/minigame/leaderboard/${encodeURIComponent(game)}${query}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }
}
