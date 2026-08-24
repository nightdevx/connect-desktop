import type { DesktopResult, LobbyStreamEvent } from "@shared/desktop-api-types";
import type { MinigameTable, MultiplayerGameId } from "@shared/minigames";

/**
 * The bridge, for the two-player half of the page.
 *
 * Deliberately NOT workspace's lobby-service, which wraps the stream call: the
 * workspace shell imports this feature, so importing back out of it would close
 * a cycle that scripts/check-architecture.cjs refuses. free-games hit the same
 * wall for getApiErrorMessage.
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

type TableResult = DesktopResult<{ table: MinigameTable | null }>;
type TableListResult = DesktopResult<{
  tables: MinigameTable[];
  disabledGames?: string[];
}>;

export const multiplayerService = {
  /** Every open table. Each later change arrives on the stream below. */
  listTables: (): Promise<TableListResult> => {
    if (typeof window.desktopApi.listMinigameTables !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError as TableListResult);
    }

    return window.desktopApi.listMinigameTables();
  },

  open: (game: MultiplayerGameId): Promise<TableResult> => play({ action: "open", game }),

  join: (tableId: string): Promise<TableResult> => play({ action: "join", tableId }),

  /**
   * Begins a game at a table that is not full.
   *
   * Only the games that seat more than two ever need it — a two-player table
   * starts the moment the second chair is taken. What it buys the others is the
   * difference between "we are four" and "we are three and Ali is not coming",
   * which is a decision no rule can make.
   */
  start: (tableId: string): Promise<TableResult> => play({ action: "start", tableId }),

  /**
   * `cell` under a gravity game names a target the server reduces to a column.
   * The landing row is not sent because a client cannot know it without racing
   * the opponent.
   */
  move: (tableId: string, cell: number): Promise<TableResult> =>
    play({ action: "move", tableId, cell }),

  /**
   * Everything that is not a bare cell: a verb and its colon-separated
   * arguments ("roll", "keep:1,3,5", "place:12:4,5,6"), with chess's UCI as the
   * degenerate case of a verb with no arguments.
   *
   * ONE method rather than one per game. A method per game would be a preload
   * method, an IPC channel and a zod schema per game, for what is one string
   * the server parses — and the server has to re-check every one of them
   * regardless, because a client may send anything.
   */
  sendMove: (tableId: string, move: string): Promise<TableResult> =>
    play({ action: "move", tableId, move }),

  /** A rematch at the same table, keeping both seats. */
  restart: (tableId: string): Promise<TableResult> => play({ action: "restart", tableId }),

  /** Stands up from whatever table this account is at. Takes no id. */
  leave: (): Promise<TableResult> => play({ action: "leave" }),

  watch: (tableId: string): Promise<TableResult> => play({ action: "watch", tableId }),

  unwatch: (): Promise<TableResult> => play({ action: "unwatch" }),

  /** Pushes from the lobby socket. Returns an unsubscribe. */
  onLobbyStreamEvent: (
    listener: (event: LobbyStreamEvent) => void,
  ): (() => void) => {
    if (typeof window.desktopApi.onLobbyStreamEvent !== "function") {
      return () => undefined;
    }

    return window.desktopApi.onLobbyStreamEvent(listener);
  },
};

function play(
  payload: Parameters<typeof window.desktopApi.playMinigame>[0],
): Promise<TableResult> {
  if (typeof window.desktopApi.playMinigame !== "function") {
    return Promise.resolve(desktopBridgeOutdatedError as TableResult);
  }

  return window.desktopApi.playMinigame(payload);
}
