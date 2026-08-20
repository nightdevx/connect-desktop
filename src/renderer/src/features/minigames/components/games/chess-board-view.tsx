import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MinigameChessBoard } from "@shared/minigames";
import {
  boardOrder,
  isLightSquare,
  isWhitePiece,
  lastMoveSeat,
  moveOffset,
  movesByOrigin,
  pairMoves,
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
 * them. The check mark and the slide are the same deal: the server sends the
 * square of the checked king and the move in UCI, and neither is worked out
 * again here.
 *
 * The board, the ticker and the scoresheet are three exports rather than one
 * component, because they belong in three different slots of the game shell —
 * the header, the frame and the column beside it. Bundling them meant chess
 * laying out its own page, 160px wider than every other game, so the whole
 * column jumped whenever the game changed.
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

  // The `?? []` is not belt-and-braces on the types, which say this is always
  // an array. It is the version skew: the desktop auto-updates and the backend
  // is deployed separately, so a build carrying this file can meet a server
  // that predates these fields. Iterating an undefined inside a useMemo is a
  // throw during render, which the error boundary turns into a dead page —
  // exactly how the null `legalMoves` of a mated board surfaced.
  const pieces = useMemo(() => parseFenPieces(board.fen), [board.fen]);
  const moves = useMemo(() => movesByOrigin(board.legalMoves ?? []), [board.legalMoves]);
  const flipped = mySeat === 1;
  const order = useMemo(() => boardOrder(flipped), [flipped]);

  const lastMove = board.lastMove ? parseUci(board.lastMove) : null;
  // Where the arriving piece has to start from, so it can slide home. null on a
  // fresh board and on a move whose squares did not parse.
  const arrival = lastMove ? moveOffset(lastMove, flipped) : null;
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
      <div className="ct-board ct-chess-board" aria-label="Satranç tahtası">
        {order.map((index, position) => {
          const square = squareName(index);
          const piece = pieces[index];
          const isTarget = targets.some((move) => move.to === square);
          // Only ever your own pieces: the server sends the side to move's moves
          // and nobody else's, so "has a legal move" IS "is mine, and it is my
          // turn".
          const isSelectable = isMyTurn && moves.has(square);
          // The piece that just landed, and only that one — keying every glyph
          // off the move would remount the whole board on every turn.
          const isArriving = arrival !== null && lastMove?.to === square;

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
              // Where the move ended, so the flash lands on the piece rather
              // than on the empty square it came from.
              data-landed={lastMove?.to === square ? "true" : undefined}
              // The server names the king in danger; this file does not work out
              // that anybody is in check.
              data-check={board.checkSquare === square ? "true" : undefined}
              disabled={!isSelectable && !isTarget}
              onClick={() => handleSquare(square)}
              aria-label={piece ? `${square}, dolu` : square}
            >
              {piece ? (
                <span
                  // The key is what replays the slide: React reuses a DOM node
                  // whose key did not change, and a reused node does not restart
                  // its animation. Only the arriving piece takes a per-move key,
                  // so nothing else remounts.
                  key={isArriving ? `${square}-${board.lastMove}` : square}
                  className="ct-chess-piece"
                  data-color={isWhitePiece(piece) ? "white" : "black"}
                  data-arriving={isArriving ? "true" : undefined}
                  style={
                    isArriving && arrival
                      ? ({
                          "--chess-dx": String(arrival.dx),
                          "--chess-dy": String(arrival.dy),
                        } as CSSProperties)
                      : undefined
                  }
                >
                  {pieceGlyph(piece)}
                </span>
              ) : null}

              {/* Coordinates on the two outer edges, as on a real board. The
                  scoresheet is written in them, so without these "Nf3" is a word
                  rather than a square. */}
              {position % 8 === 0 ? (
                <span className="ct-chess-coord" data-edge="rank" aria-hidden="true">
                  {square[1]}
                </span>
              ) : null}
              {position >= 56 ? (
                <span className="ct-chess-coord" data-edge="file" aria-hidden="true">
                  {square[0]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {promotion ? (
        <div className="ct-chess-promotion" role="group" aria-label="Terfi seç">
          <span className="ct-chess-promotion-label">Piyon terfi ediyor</span>
          <div className="ct-chess-promotion-choices">
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
                {/* The promoting side is the side to move, and the side to move
                    is you — this picker only ever opens on your own move. */}
                <span
                  className="ct-chess-piece"
                  data-color={mySeat === 0 ? "white" : "black"}
                >
                  {pieceGlyph(move.promotion ?? "q")}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * What just happened, in one line.
 *
 * The complaint this answers is that a move by the other player was invisible:
 * the board repainted, and unless you were watching the right two squares
 * nothing told you the turn had come round, what they played, or that somebody
 * was in check. Announced to screen readers by the same markup, which is the
 * same information by another route rather than an extra feature.
 */
export function ChessTicker({
  board,
  mySeat,
}: {
  board: MinigameChessBoard;
  mySeat: number;
}) {
  const history = board.history ?? [];
  const played = lastMoveSeat(history);
  const notation = history[history.length - 1] ?? null;
  const isMine = played === mySeat;

  return (
    <div
      className="ct-chess-ticker"
      // Whose move it announces, so the dot beside it wears that side's colour
      // rather than a neutral one.
      data-seat={played >= 0 ? played : undefined}
      role="status"
      aria-live="polite"
    >
      {notation ? (
        <span className="ct-chess-ticker-move">
          <span className="ct-versus-mark" data-seat={played} aria-hidden="true" />
          {/* Seat -1 is the audience, where neither "you" nor "your opponent"
              is true of anybody at the table. */}
          <span>{mySeat < 0 ? "Son hamle:" : isMine ? "Oynadın:" : "Rakip oynadı:"}</span>
          <strong key={`${history.length}-${notation}`}>{notation}</strong>
        </span>
      ) : (
        <span className="ct-chess-ticker-move ct-chess-ticker-idle">
          Beyaz başlar. İlk hamle bekleniyor.
        </span>
      )}

      {/* Only the server sets this, and only for the king actually in danger.
          `outcome` is non-empty exactly when the game is over, which on a
          checked king can only mean mate. */}
      {board.checkSquare ? (
        <span className="ct-chess-check" role="alert">
          {board.outcome ? "ŞAH MAT" : "ŞAH"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The scoresheet.
 *
 * Beside the board rather than under it, so a glance covers both, and scrolled
 * to the bottom on every move — the interesting end of a move list is always
 * the new end, and a list that has to be dragged is a list nobody reads.
 */
export function ChessSheet({ board }: { board: MinigameChessBoard }) {
  const history = useMemo(() => board.history ?? [], [board.history]);
  const pairs = useMemo(() => pairMoves(history), [history]);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scroller.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [history.length]);

  return (
    <div className="ct-chess-sheet">
      <span className="ct-chess-sheet-title">Hamleler</span>
      <div className="ct-chess-sheet-scroll" ref={scroller}>
        {pairs.length === 0 ? (
          <p className="ct-chess-sheet-empty">Henüz hamle yok.</p>
        ) : (
          <ol className="ct-chess-sheet-list">
            {pairs.map((pair, index) => {
              const isLastRow = index === pairs.length - 1;

              return (
                <li key={pair.number} className="ct-chess-sheet-row">
                  <span className="ct-chess-sheet-number">{pair.number}.</span>
                  <span
                    className="ct-chess-sheet-move"
                    // The newest ply only. Black's move is the last one when it
                    // exists, otherwise white's is.
                    data-current={isLastRow && !pair.black ? "true" : undefined}
                  >
                    {pair.white}
                  </span>
                  <span
                    className="ct-chess-sheet-move"
                    data-current={isLastRow && pair.black ? "true" : undefined}
                  >
                    {pair.black ?? "…"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
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
