/**
 * The wire shapes of the two-player games, shared by main and the renderer.
 *
 * A table is its own lobby. It belongs to no voice room and no text room:
 * somebody opens one, it shows up in a list, somebody else joins it, and the
 * two of them play. Nothing here mentions a lobby id, and that absence is the
 * design.
 *
 * The server owns the board. Nothing in this file implements a rule -- there is
 * no move validation, no win detection and no turn logic on this side, and that
 * is deliberate: a second copy of the rules is a second thing to get wrong, and
 * the one that would be wrong is the one the player is looking at. The desktop
 * draws a Table and sends clicks.
 *
 * Kept in step with internal/minigame/hub.go by hand. The id union is the seam:
 * adding a game means a row in that file's catalogue and an entry here, and the
 * renderer's board registry is a Record over this union, so the compiler names
 * the half that was forgotten.
 */

export const MULTIPLAYER_GAME_IDS = ["xox", "connect4", "chess"] as const;

export type MultiplayerGameId = (typeof MULTIPLAYER_GAME_IDS)[number];

export function isMultiplayerGameId(value: string): value is MultiplayerGameId {
  return (MULTIPLAYER_GAME_IDS as readonly string[]).includes(value);
}

export interface MinigamePlayer {
  userId: string;
  /** Carried on the wire so a name can be drawn without a directory lookup. */
  username: string;
}

/** Drop a mark on a grid: XOX and Connect Four. */
export interface MinigameGridBoard {
  columns: number;
  rows: number;
  /** Row-major, `columns * rows` long. -1 empty, else the index into players. */
  cells: number[];
  /** The cells that made the win, for highlighting. Empty unless winner is set. */
  winningCells: number[];
  /** Where the last mark landed. null on a freshly dealt board. */
  lastCell: number | null;
}

export interface MinigameChessBoard {
  /** The whole position. The client renders from this and stores nothing else. */
  fen: string;
  /**
   * Every move the side to move may play, in UCI ("e2e4", "e7e8q"). The client
   * highlights from this list and never works a legal move out for itself;
   * a promotion is the four entries sharing a from/to and differing by suffix.
   */
  legalMoves: string[];
  /** The move just played, in UCI, so both of its squares can be flashed. */
  lastMove: string | null;
  /**
   * Why the game ended, already in Turkish, for the hint line. Empty while
   * running. Text because stalemate and insufficient material are both draws
   * and the envelope's `draw` flag cannot tell them apart.
   */
  outcome: string;
}

export interface MinigameTable {
  id: string;
  game: MultiplayerGameId;
  /** Who opened it. Survives them leaving, so the list can still say whose it was. */
  hostUserId: string;
  /** Seat order IS colour order in chess: index 0 plays white. */
  players: MinigamePlayer[];
  /** Index into players. Meaningless once the table is finished. */
  turn: number;
  /** null while running or drawn. */
  winner: number | null;
  draw: boolean;

  /**
   * Exactly one of these is present, chosen by `game`. Two optional fields
   * rather than one `unknown`: this is the narrowing the board components
   * actually use, and a third game cannot silently reuse the second's shape.
   */
  grid?: MinigameGridBoard;
  chess?: MinigameChessBoard;

  createdAt: string;
  updatedAt: string;
}

/** Whether the table can still take a move. Mirrors Table.Finished. */
export function isTableFinished(table: MinigameTable): boolean {
  return table.winner !== null || table.draw;
}

/** The seat this account holds at a table, or -1. */
export function seatOf(table: MinigameTable, userId: string): number {
  return table.players.findIndex((player) => player.userId === userId);
}

/** Whether the table still has a free chair. */
export function isTableOpen(table: MinigameTable): boolean {
  return table.players.length < 2;
}

/**
 * Personal bests, and the board that ranks them.
 *
 * Solo games only. A win against another person is not a personal best, so the
 * two-player ids never appear here -- internal/minigame/score.go keeps the
 * authoritative list and refuses anything else.
 */
export interface MinigameLeaderboardEntry {
  rank: number;
  /** Carried so a client can mark its own row without matching on the name. */
  userId: string;
  username: string;
  displayName: string;
  score: number;
  achievedAt: string;
}

export interface MinigameLeaderboard {
  game: string;
  entries: MinigameLeaderboardEntry[];
  /**
   * The viewer's own place, which is the number they came for and is usually
   * not inside `entries`. 0 when they have no record at this game.
   */
  viewerRank: number;
}

/** Best score per game id. A game never played is simply absent. */
export type MinigameScoreMap = Record<string, number>;
