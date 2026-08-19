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
type TableListResult = DesktopResult<{ tables: MinigameTable[] }>;

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
   * `cell` under a gravity game names a target the server reduces to a column.
   * The landing row is not sent because a client cannot know it without racing
   * the opponent.
   */
  move: (tableId: string, cell: number): Promise<TableResult> =>
    play({ action: "move", tableId, cell }),

  /**
   * Chess. The UCI string is taken verbatim from the server's own legal-move
   * list, so the client never composes one it has not been offered — and the
   * server re-checks it regardless.
   */
  chessMove: (tableId: string, uci: string): Promise<TableResult> =>
    play({ action: "move", tableId, move: uci }),

  /** A rematch at the same table, keeping both seats. */
  restart: (tableId: string): Promise<TableResult> => play({ action: "restart", tableId }),

  /** Stands up from whatever table this account is at. Takes no id. */
  leave: (): Promise<TableResult> => play({ action: "leave" }),

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
