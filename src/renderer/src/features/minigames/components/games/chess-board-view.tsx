import { useMemo, useState } from "react";
import type { MinigameChessBoard } from "@shared/minigames";
import {
  boardOrder,
  isLightSquare,
  isWhitePiece,
  movesByOrigin,
  parseFenPieces,
  parseUci,
  pieceGlyph,
  squareName,
  type UciMove,
} from "../../chess-position";

interface ChessBoardViewProps {
  board: MinigameChessBoard;
  /** Seat 0 is white; a black player sees the board from their own side. */
  mySeat: number;
  isMyTurn: boolean;
  isBusy: boolean;
  onMove: (uci: string) => void;
}

/**
 * A chessboard, hand-drawn.
 *
 * No board library. The hard half of chess is the rules, and those are on the
 * server behind a tested engine; what is left is sixty-four squares, a glyph
 * per piece and two clicks. A drag-and-drop component would have added a
 * dependency, its own render model and its own version churn to draw a
 * checkerboard.
 *
 * It knows no chess. A square is selectable because the server listed a move
 * FROM it and a target because the server listed a move TO it — so castling,
 * en passant and promotion all work here without this file having heard of
 * them.
 */
export function ChessBoardView({
  board,
  mySeat,
  isMyTurn,
  isBusy,
  onMove,
}: ChessBoardViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<UciMove[] | null>(null);

  const pieces = useMemo(() => parseFenPieces(board.fen), [board.fen]);
  const moves = useMemo(() => movesByOrigin(board.legalMoves), [board.legalMoves]);
  const order = useMemo(() => boardOrder(mySeat === 1), [mySeat]);

  const lastMove = board.lastMove ? parseUci(board.lastMove) : null;
  const targets = selected ? (moves.get(selected) ?? []) : [];

  const handleSquare = (square: string) => {
    if (!isMyTurn || isBusy) {
      return;
    }

    // Clicking a square you can move FROM always re-selects, even mid-selection:
    // picking a second piece is far more common than wanting to cancel, and a
    // click on your own piece is never a legal destination anyway.
    if (moves.has(square) && square !== selected) {
      setSelected(square);
      return;
    }

    const candidates = targets.filter((move) => move.to === square);
    if (candidates.length === 0) {
      setSelected(null);
      return;
    }

    // Several moves to one square means a promotion is due — that is the only
    // way the server's list can carry duplicates, so it needs no other signal.
    if (candidates.length > 1) {
      setPromotion(candidates);
      return;
    }

    setSelected(null);
    onMove(uciOf(candidates[0]));
  };

  return (
    <>
      <div
        className="ct-minigame-board ct-chess-board"
        style={{ gridTemplateColumns: "repeat(8, 1fr)" }}
        aria-label="Satranç tahtası"
      >
        {order.map((index) => {
          const square = squareName(index);
          const piece = pieces[index];
          const isTarget = targets.some((move) => move.to === square);
          // Only ever your own pieces: the server sends the side to move's moves
          // and nobody else's, so "has a legal move" IS "is mine, and it is my
          // turn".
          const isSelectable = isMyTurn && moves.has(square);

          return (
            <button
              key={square}
              type="button"
              className="ct-chess-square"
              data-light={isLightSquare(index) ? "true" : undefined}
              data-selected={selected === square ? "true" : undefined}
              data-target={isTarget ? "true" : undefined}
              // A target that holds a piece is a capture. Drawn differently
              // because a dot centred on an enemy queen reads as "empty".
              data-capture={isTarget && piece ? "true" : undefined}
              data-last={
                lastMove && (lastMove.from === square || lastMove.to === square)
                  ? "true"
                  : undefined
              }
              disabled={!isSelectable && !isTarget}
              onClick={() => handleSquare(square)}
              aria-label={piece ? `${square}, dolu` : square}
            >
              {piece ? (
                <span
                  className="ct-chess-piece"
                  data-color={isWhitePiece(piece) ? "white" : "black"}
                >
                  {pieceGlyph(piece)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {promotion ? (
        <div className="ct-chess-promotion" role="group" aria-label="Terfi seç">
          <span className="ct-chess-promotion-label">Piyon terfi ediyor:</span>
          {promotion.map((move) => (
            <button
              key={uciOf(move)}
              type="button"
              className="ct-chess-promotion-choice"
              onClick={() => {
                setPromotion(null);
                setSelected(null);
                onMove(uciOf(move));
              }}
              aria-label={PROMOTION_LABELS[move.promotion ?? "q"]}
            >
              {/* The promoting side is the side to move, and the side to move is
                  you — this picker only ever opens on your own move. */}
              <span className="ct-chess-piece" data-color={mySeat === 0 ? "white" : "black"}>
                {pieceGlyph(move.promotion ?? "q")}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

const PROMOTION_LABELS: Record<string, string> = {
  q: "Vezir",
  r: "Kale",
  b: "Fil",
  n: "At",
};

function uciOf(move: UciMove): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}
