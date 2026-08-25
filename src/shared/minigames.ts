/**
 * The wire shapes of the multiplayer games, shared by main and the renderer.
 *
 * A table is its own lobby. It belongs to no voice room and no text room:
 * somebody opens one, it shows up in a list, somebody else joins it, and they
 * play. Nothing here mentions a lobby id, and that absence is the design.
 *
 * The server owns the board. Nothing in this file implements a rule -- there is
 * no move validation, no win detection and no turn logic on this side, and that
 * is deliberate: a second copy of the rules is a second thing to get wrong, and
 * the one that would be wrong is the one the player is looking at. The desktop
 * draws a Table and sends moves.
 *
 * Kept in step with internal/minigame by hand. The id union is the seam: adding
 * a game means a row in hub.go's catalogue and an entry here, and the
 * renderer's board registry is a Record over this union, so the compiler names
 * the half that was forgotten.
 *
 * A board field per FAMILY, not per game. Five titles share MinigameGridBoard
 * and two share MinigameRummyBoard, because what differs between them is
 * numbers in the server's catalogue and not the shape of a board.
 */

export const MULTIPLAYER_GAME_IDS = [
  "xox",
  "connect4",
  "gomoku",
  "connect5",
  "connect4trio",
  "chess",
  "reversi",
  "boxes",
  "blokus",
  "backgammon",
  "yahtzee",
  "ludo",
  "quiz",
  "uno",
  "battleship",
  "okey",
  "rummy1",
  "poker",
] as const;

export type MultiplayerGameId = (typeof MULTIPLAYER_GAME_IDS)[number];

export function isMultiplayerGameId(value: string): value is MultiplayerGameId {
  return (MULTIPLAYER_GAME_IDS as readonly string[]).includes(value);
}

/**
 * How many chairs each table has, and how many have to be filled before it can
 * start.
 *
 * A SECOND statement of what internal/minigame/hub.go's catalogue already says,
 * and the only one in this file. It is here because the browser has to draw
 * "2/4 kişi" and decide whether to offer a Başlat button before it has ever
 * seen the server's opinion — and asking the server for the shape of a table
 * that has not been opened yet would be a round trip to learn a constant.
 *
 * scripts/check-minigames.cjs asserts the two agree.
 */
export const MULTIPLAYER_SEATS: Record<
  MultiplayerGameId,
  { min: number; max: number }
> = {
  xox: { min: 2, max: 2 },
  connect4: { min: 2, max: 2 },
  gomoku: { min: 2, max: 2 },
  connect5: { min: 2, max: 2 },
  connect4trio: { min: 3, max: 3 },
  chess: { min: 2, max: 2 },
  reversi: { min: 2, max: 2 },
  boxes: { min: 2, max: 4 },
  blokus: { min: 2, max: 4 },
  backgammon: { min: 2, max: 2 },
  yahtzee: { min: 2, max: 4 },
  ludo: { min: 2, max: 4 },
  quiz: { min: 2, max: 4 },
  uno: { min: 2, max: 10 },
  battleship: { min: 2, max: 2 },
  okey: { min: 2, max: 4 },
  rummy1: { min: 2, max: 4 },
  poker: { min: 2, max: 4 },
};

/**
 * What the host set this table to, before it was dealt.
 *
 * Always sent, and always real numbers rather than zeroes to be interpreted:
 * the server fills it from its own catalogue at open time, so the settings can
 * be drawn from the table in front of you instead of from a second copy of the
 * defaults kept in step by hand. A game that deals no hand carries handSize 0,
 * and that is how a client knows there is no control to draw.
 *
 * Optional on the type only because an older server does not send it.
 */
export interface MinigameTableOptions {
  /** Cards dealt to each player at the start. 0 for a game that deals none. */
  handSize: number;
  /** Chairs this table has, at most the catalogue maximum for the game. */
  maxSeats: number;
}

export interface MinigamePlayer {
  userId: string;
  /** Carried on the wire so a name can be drawn without a directory lookup. */
  username: string;
  /**
   * Whether this seat was vacated mid-game.
   *
   * The seat stays in the list: every board indexes its per-seat state by
   * position, so the server keeps the chair to hold those indices still. Absent
   * rather than false on a seat somebody is still in.
   */
  left?: boolean;
}

/** Drop a mark on a grid: XOX, Connect Four, Gomoku and the two bigger boards. */
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
  /** Every move so far in algebraic notation, oldest first, for the scoresheet. */
  history: string[];
  /** The square of the king in check ("e1"), empty when neither is. */
  checkSquare: string;
  /** Why the game ended, already in Turkish. Empty while running. */
  outcome: string;
}

/** Dots and boxes. Two edge arrays because the two have different shapes. */
export interface MinigameBoxesBoard {
  /** Boxes across and down; the edge arrays are sized from these. */
  columns: number;
  rows: number;
  /** (rows+1) * columns. The edge ABOVE box (c, r). -1 unclaimed, else a seat. */
  horizontal: number[];
  /** rows * (columns+1). The edge LEFT of box (c, r). */
  vertical: number[];
  /** rows * columns. -1 until somebody closes it. */
  boxes: number[];
  scores: number[];
  /** "h:12" or "v:7", for the flash. Empty on a fresh board. */
  lastEdge: string;
  /** Whether the last move closed a box, which is why the turn did not move. */
  chained: boolean;
}

export interface MinigameReversiBoard {
  size: number;
  /** Row-major. -1 empty, else the seat that owns the disc. */
  cells: number[];
  /** Every cell the side to move may play. The client computes nothing. */
  legalMoves: number[];
  lastCell: number | null;
  /** What the last move turned over, so it can be animated. */
  flipped: number[];
  scores: number[];
  /** The side to move got here because the other side had nothing to play. */
  passed: boolean;
}

export interface MinigameBlokusBoard {
  size: number;
  /** Row-major. -1 empty, else the seat that owns the square. */
  cells: number[];
  /** remaining[seat] is the piece indices still in that player's tray. */
  remaining: number[][];
  scores: number[];
  /** A seat that has passed is out: the board only ever fills up further. */
  passed: boolean[];
  /** The square each seat must cover with its first piece. */
  corners: number[];
  lastCells: number[];
  /** The piece each seat placed most recently, or -1. */
  lastPiece: number[];
  /**
   * The twenty-one shapes, as flat x,y pairs. Sent WITH the board rather than
   * hard-coded here, so there is exactly one definition of what a piece is.
   */
  shapes: number[][];
}

export interface MinigameYahtzeeBoard {
  /** Five dice, 1..6. All zero before the first roll of a turn. */
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  /** sheets[seat][category], -1 for a box nobody has written in yet. */
  sheets: number[][];
  /** The box labels, so the client keeps no copy of the rules. */
  categories: string[];
  /** What each box would score right now. -1 for one already filled. */
  preview: number[];
  upper: number[];
  bonus: boolean[];
  totals: number[];
  filled: number[];
}

export interface MinigameLudoBoard {
  /**
   * tokens[seat][0..3], each a step count: -1 in the base, 0..50 on the shared
   * loop, 51..55 in that player's own column, 56 home.
   */
  tokens: number[][];
  /** The absolute loop square each seat enters on. */
  entries: number[];
  /** Loop squares on which a token cannot be captured. */
  safe: number[];
  dice: number;
  rolled: boolean;
  /** Which of the current player's tokens the roll may move. */
  moves: number[];
  home: number[];
  /** "", "capture" or "home". */
  lastEvent: string;
  sixes: number;
}

export interface MinigameGammonBoard {
  /** owner[point] is -1 for empty, else the seat. count[point] is how many. */
  owner: number[];
  count: number[];
  bar: number[];
  off: number[];
  /** The dice still to play. A double is four entries of the same value. */
  dice: number[];
  rolled: boolean;
  /** What was actually rolled, kept for display after the dice are used up. */
  roll: number[];
  /** "from-to", with 24 for the bar and 25 for off. */
  legalMoves: string[];
  lastMove: string;
}

export interface MinigameQuizBoard {
  question: string;
  options: string[];
  asked: number;
  total: number;
  /** Which option the current player picked, -1 until they do. */
  chosen: number;
  /** The right answer, but only once it has been given. -1 otherwise. */
  correct: number;
  reveal: boolean;
  scores: number[];
  right: number[];
}

/** Colour "w" is a wild, which has no colour until it is played. */
export interface MinigameUnoCard {
  color: "r" | "y" | "g" | "b" | "w";
  /** "0".."9", "skip", "reverse", "draw2", "wild", "wild4". */
  kind: string;
}

export interface MinigameUnoBoard {
  /**
   * hands[seat]. Only the viewer's own is populated; every other entry is an
   * empty list, and `counts` is what says how big it really is.
   */
  hands: MinigameUnoCard[][];
  counts: number[];
  top: MinigameUnoCard;
  /** The colour in force, which differs from `top` after a wild. */
  color: string;
  /** How many cards are left to draw. A count, not the cards. */
  pile: number;
  direction: number;
  /** Whether the player to move has already drawn this turn. */
  drawn: boolean;
  lastEvent: string;
}

export interface MinigameFleetShip {
  size: number;
  /** The anchor square, or -1 while the ship is in the tray or hidden. */
  cell: number;
  vertical: boolean;
  /** Empty for an enemy ship that is still afloat. */
  cells: number[];
  hits: number;
  sunk: boolean;
}

export interface MinigameFleetBoard {
  size: number;
  /** "placing" or "firing". During placing the table's turn is -1. */
  phase: string;
  ships: MinigameFleetShip[][];
  /** shots[seat][cell]: 0 not fired at, 1 miss, 2 hit. Public, both ways. */
  shots: number[][];
  ready: boolean[];
  remaining: number[];
  lastShot: number;
  /** The fleet, so the tray needs no list of its own. */
  sizes: number[];
}

/** A blank tile has value 0 and no colour. */
export interface MinigameRummyTile {
  color: string;
  value: number;
}

export interface MinigameRummyBoard {
  /** Only the viewer's own survives redaction. */
  hands: MinigameRummyTile[][];
  counts: number[];
  indicator: MinigameRummyTile;
  /** The wild. NOT the blanks: those play as an extra copy of this tile. */
  okey: MinigameRummyTile;
  pile: number;
  /** discards[seat], oldest first. Only the previous seat's top may be taken. */
  discards: MinigameRummyTile[][];
  /** Whether the player to move holds the extra tile and owes a discard. */
  drawn: boolean;
  /**
   * Everything laid face up. 101 only -- the classic table declares a whole
   * hand at once and never puts a group on the table.
   */
  melds?: MinigameRummyMeld[];
  /** opened[seat] once that seat has laid its 101 points. */
  opened?: boolean[];
  /** openedPairs[seat] if they did it on pairs, which changes what they may do. */
  openedPairs?: boolean[];
  /** Tiles a seat holds at rest: 14 on the classic table, 21 in 101. */
  handSize?: number;
  /** Points needed to open. 0 on the classic table. */
  openThreshold?: number;
  penalties: number[];
  out: boolean[];
  /** 0 means a single hand decides the table. */
  target: number;
  handWinner: number;
  lastEvent: string;
}

export interface MinigameRummyMeld {
  owner: number;
  /** "run", "set" or "pair". */
  kind: string;
  tiles: MinigameRummyTile[];
}

/** Rank 2..14, where 14 is the ace. */
export interface MinigamePokerCard {
  rank: number;
  suit: string;
}

export interface MinigamePokerBoard {
  /** Only the viewer's own -- and, at a showdown, everybody still in the hand. */
  hands: MinigamePokerCard[][];
  revealed: boolean[];
  community: MinigamePokerCard[];
  chips: number[];
  /** What each seat has put in this ROUND, and over the whole hand. */
  bets: number[];
  committed: number[];
  folded: boolean[];
  allIn: boolean[];
  pot: number;
  toCall: number;
  minRaise: number;
  /** "preflop", "flop", "turn", "river" or "showdown". */
  stage: string;
  dealer: number;
  /** What the player to move may do. The client draws buttons from this. */
  actions: string[];
  /** The cheapest legal raise TO, as an absolute number. */
  raiseTo: number;
  results: string[];
  lastEvent: string;
}

export interface MinigameTable {
  id: string;
  game: MultiplayerGameId;
  /** Who opened it. Survives them leaving, so the list can still say whose it was. */
  hostUserId: string;
  /** Seat order IS colour order in chess: index 0 plays white. */
  players: MinigamePlayer[];
  /**
   * The audience. Never seats: every index elsewhere on the table -- turn,
   * winner, the per-seat arrays -- indexes `players` and nothing else.
   *
   * Optional because an older server does not send it.
   */
  spectators?: MinigamePlayer[];
  /** See MinigameTableOptions. Absent from an older server. */
  options?: MinigameTableOptions;
  /**
   * Index into players -- or -1, which means "anybody seated may move".
   *
   * The sentinel is what Battleship's simultaneous fleet placement runs on. It
   * is not a null: a table always has a turn state, and -1 is one of them.
   */
  turn: number;
  /**
   * Whether the first move may be made. A full table sets it on its own; a
   * table that seats up to four and has three people needs somebody to press
   * Başlat. It also closes the table to late joiners.
   */
  started: boolean;
  /** null while running or drawn. */
  winner: number | null;
  draw: boolean;

  /**
   * Exactly one of these is present, chosen by `game`. Optional fields rather
   * than one `unknown`: this is the narrowing the board components actually
   * use, and a new game cannot silently reuse another's shape.
   */
  grid?: MinigameGridBoard;
  chess?: MinigameChessBoard;
  boxes?: MinigameBoxesBoard;
  reversi?: MinigameReversiBoard;
  blokus?: MinigameBlokusBoard;
  yahtzee?: MinigameYahtzeeBoard;
  ludo?: MinigameLudoBoard;
  gammon?: MinigameGammonBoard;
  quiz?: MinigameQuizBoard;
  uno?: MinigameUnoBoard;
  fleet?: MinigameFleetBoard;
  rummy?: MinigameRummyBoard;
  poker?: MinigamePokerBoard;

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

/**
 * Whether this account is actually AT the table.
 *
 * Not the same question as seatOf >= 0, and that is the whole reason it exists.
 * A seat vacated mid-game keeps its place in `players` -- every board indexes
 * its per-seat state by position, so the server holds the chair rather than
 * renumbering a dealt board -- which means the person who walked out is still
 * found there. Asking seatOf left them looking at the table they had just left,
 * still being offered "Masadan kalk".
 */
export function isSeatedAt(table: MinigameTable, userId: string): boolean {
  const seat = seatOf(table, userId);
  return seat >= 0 && !table.players[seat]?.left;
}

export function spectatorsOf(table: MinigameTable): MinigamePlayer[] {
  return table.spectators ?? [];
}

export function isSpectating(table: MinigameTable, userId: string): boolean {
  return spectatorsOf(table).some((watcher) => watcher.userId === userId);
}

export interface MinigameTableOverview {
  id: string;
  game: MultiplayerGameId;
  hostUserId: string;
  players: MinigamePlayer[];
  spectators: MinigamePlayer[];
  options?: MinigameTableOptions;
  started: boolean;
  finished: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whether the table still has a free chair.
 *
 * A started table has none, whatever the seat count says: the server refuses a
 * joiner once play has begun, because a hand cannot be dealt to somebody three
 * tricks in.
 */
export function isTableOpen(table: MinigameTable): boolean {
  return !table.started && table.players.length < tableSeats(table).max;
}

/** Whether enough people are seated for somebody to press Başlat. */
export function canStartTable(table: MinigameTable): boolean {
  return !table.started && table.players.length >= tableSeats(table).min;
}

/**
 * The seats THIS table has, which is not always what the game allows.
 *
 * A host may narrow a table before it is dealt -- three-handed Uno at a
 * four-handed game -- so the catalogue is the ceiling and the table is the
 * truth. Falls back to the catalogue for a table from a server too old to send
 * its settings.
 */
export function tableSeats(table: {
  game: MultiplayerGameId;
  options?: MinigameTableOptions;
}): { min: number; max: number } {
  const catalogue = MULTIPLAYER_SEATS[table.game];
  const asked = table.options?.maxSeats ?? 0;
  if (asked <= 0 || asked >= catalogue.max) {
    return catalogue;
  }
  return { min: Math.min(catalogue.min, asked), max: asked };
}

/** The bounds the server will accept for a hand. Mirrors internal/minigame. */
export const MINIGAME_HAND_SIZE = { min: 1, max: 15 } as const;

/**
 * Personal bests, and the board that ranks them.
 *
 * Solo games only. A win against another person is not a personal best, so the
 * multiplayer ids never appear here -- internal/minigame/score.go keeps the
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
