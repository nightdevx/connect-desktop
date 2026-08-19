/**
 * Reading a chess position for the screen. No rules live here.
 *
 * The server decides what is legal and hands the client a FEN plus a list of
 * legal moves in UCI; this file only turns those two strings into something a
 * grid of divs can render. It knows nothing about how a knight moves, and that
 * absence is the point -- the one place chess rules exist is
 * internal/minigame/chess.go, on top of a library that is already tested.
 *
 * Pure, so scripts/check-minigames.cjs can assert it. FEN parsing is exactly
 * the kind of code that fails silently: an off-by-one in the rank order paints
 * a board that is upside down but perfectly plausible.
 */

export const BOARD_SQUARES = 64;

const FILES = "abcdefgh";

/**
 * Square names in render order: index 0 is a8, index 63 is h1.
 *
 * That is the order FEN itself uses -- rank 8 first, file a first -- so the
 * parser below can walk the string and the array together.
 */
export function squareName(index: number): string {
  const file = index % 8;
  const rank = 8 - Math.floor(index / 8);
  return `${FILES[file]}${rank}`;
}

/** Whether a square is light. a8 (index 0) is light, as it is on a real board. */
export function isLightSquare(index: number): boolean {
  const file = index % 8;
  const rank = Math.floor(index / 8);
  return (file + rank) % 2 === 0;
}

/**
 * The 64 squares of a FEN, in render order. null is empty; otherwise the FEN
 * letter, whose CASE carries the colour -- "K" is a white king, "k" a black one.
 *
 * Only the first field is read. The rest of a FEN (side to move, castling
 * rights, clocks) is the server's business, and re-deriving whose turn it is
 * from a string the client also has is exactly the kind of second opinion that
 * ends up disagreeing.
 */
export function parseFenPieces(fen: string): (string | null)[] {
  const board: (string | null)[] = Array.from({ length: BOARD_SQUARES }, () => null);
  const placement = fen.trim().split(/\s+/)[0] ?? "";

  let index = 0;
  for (const character of placement) {
    if (character === "/") {
      continue;
    }

    if (character >= "1" && character <= "8") {
      index += Number(character);
      continue;
    }

    // Bounds-checked rather than trusted. This string arrives over a socket,
    // and a malformed one must paint a wrong board rather than throw inside a
    // render and blank the page.
    if (index < BOARD_SQUARES) {
      board[index] = character;
    }
    index += 1;
  }

  return board;
}

/** Whether a FEN letter is a white piece. Uppercase is white, as in FEN. */
export function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase();
}

/** The glyph for a FEN letter. Both colours use the SOLID figures. */
const GLYPHS: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

/**
 * Both colours deliberately get the solid glyph, coloured by CSS.
 *
 * The outline figures (♔♕♖) are drawn as hollow shapes, so on any dark surface
 * a white king is a thin outline that all but vanishes next to a solid black
 * one. Using one shape for both and letting the palette carry the colour is
 * what every themed board does, and it is the only version that survives this
 * app having a light theme AND a dark one.
 */
export function pieceGlyph(piece: string): string {
  return GLYPHS[piece.toLowerCase()] ?? "";
}

export interface UciMove {
  from: string;
  to: string;
  /** "q" | "r" | "b" | "n" on a promotion, null otherwise. */
  promotion: string | null;
}

export function parseUci(uci: string): UciMove | null {
  if (uci.length < 4) {
    return null;
  }

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : null,
  };
}

/**
 * The legal moves, grouped by the square they start from.
 *
 * This is the whole of the client's "chess knowledge": a square is selectable
 * because the server listed a move from it, and a square is a target because
 * the server listed a move to it. A promotion shows up as several entries
 * sharing a from and a to, which is what the promotion picker keys off -- there
 * is no other signal that one is due.
 */
export function movesByOrigin(legalMoves: readonly string[]): Map<string, UciMove[]> {
  const grouped = new Map<string, UciMove[]>();

  for (const uci of legalMoves) {
    const move = parseUci(uci);
    if (!move) {
      continue;
    }
    const existing = grouped.get(move.from);
    if (existing) {
      existing.push(move);
    } else {
      grouped.set(move.from, [move]);
    }
  }

  return grouped;
}

/**
 * Render order for one seat. Black sees the board from its own side, which is
 * how every chess client works and the only way a player can read their own
 * position without mentally rotating it.
 */
export function boardOrder(flipped: boolean): number[] {
  const order = Array.from({ length: BOARD_SQUARES }, (_, index) => index);
  return flipped ? order.reverse() : order;
}

/**
 * The index of a named square in render order, or -1.
 *
 * The inverse of squareName, and the reason it exists is that the server names
 * squares ("e1") while the board is an array -- the check highlight and the
 * move animation both have to cross that gap.
 */
export function squareIndex(name: string): number {
  const file = FILES.indexOf(name[0] ?? "");
  const rank = Number(name[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
    return -1;
  }
  return (8 - rank) * 8 + file;
}

/**
 * Where a square sits once the board has been turned round for its player.
 *
 * boardOrder reverses the whole array for black, so a square's position on
 * screen is its mirror index -- and that, not its true index, is what a
 * distance measured in screen squares has to be based on.
 */
function renderPosition(index: number, flipped: boolean): number {
  return flipped ? BOARD_SQUARES - 1 - index : index;
}

/**
 * How far a move travelled, in SQUARES, in the direction the board is drawn.
 *
 * The sign is "where it came from, relative to where it landed", because that
 * is what the arriving piece is offset BY before it slides home: the animation
 * starts the glyph on the origin square and ends it where it belongs, so the
 * board never has to move a real element between two grid cells.
 *
 * Flipped for black, or every animation on that side of the board would run
 * backwards.
 */
export function moveOffset(
  move: UciMove,
  flipped: boolean,
): { dx: number; dy: number } | null {
  const from = squareIndex(move.from);
  const to = squareIndex(move.to);
  if (from < 0 || to < 0) {
    return null;
  }

  const fromRender = renderPosition(from, flipped);
  const toRender = renderPosition(to, flipped);

  return {
    dx: (fromRender % 8) - (toRender % 8),
    dy: Math.floor(fromRender / 8) - Math.floor(toRender / 8),
  };
}

/** One line of the scoresheet: a number, white's move and black's reply. */
export interface MovePair {
  /** 1-based, as it is written on a real scoresheet. */
  number: number;
  white: string;
  /** null while white has moved and black has not replied yet. */
  black: string | null;
}

/**
 * The move list as numbered pairs.
 *
 * Chess counts a full move as both sides having played, so a flat list of plies
 * is not what anybody reads back. Seat 0 is white by definition and white opens
 * every game, so the parity here needs no other input.
 */
export function pairMoves(history: readonly string[]): MovePair[] {
  const pairs: MovePair[] = [];

  for (let ply = 0; ply < history.length; ply += 2) {
    pairs.push({
      number: ply / 2 + 1,
      white: history[ply],
      black: history[ply + 1] ?? null,
    });
  }

  return pairs;
}

/**
 * Which seat played the last move: 0 for white, 1 for black, -1 on an empty
 * list. What the "your opponent just played X" line is keyed off.
 */
export function lastMoveSeat(history: readonly string[]): number {
  if (history.length === 0) {
    return -1;
  }
  return (history.length - 1) % 2;
}
