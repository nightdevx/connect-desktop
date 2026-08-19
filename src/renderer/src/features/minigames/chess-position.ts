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
