import { useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { RedoOutlined, SwapOutlined } from "@ant-design/icons";
import type { VersusViewProps } from "../../versus-view";

interface Point {
  x: number;
  y: number;
}

/**
 * Blokus.
 *
 * Rotation lives entirely HERE and is never sent. The move carries the exact
 * squares the piece should fill, and the server checks that those squares are
 * the piece it claims, congruent under the eight symmetries -- so turning a
 * shape on screen stays what it is, presentation, and the server keeps the only
 * opinion about whether the result is legal. A rotation index on the wire would
 * have needed both sides to enumerate the transforms in the same order forever.
 *
 * The shapes themselves come from the server with the board, so there is no
 * second definition of what a piece is here to drift out of step.
 */
export function BlokusBoard({
  table,
  mySeat,
  isMyTurn,
  isBusy,
  onMove,
}: VersusViewProps) {
  const board = table.blokus;

  const [piece, setPiece] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const mine = board && mySeat >= 0 ? board.remaining[mySeat] : undefined;

  // A piece that has just been played is no longer in the tray, so the
  // selection has to let go of it -- otherwise the next click tries to place a
  // piece the server has already taken.
  useEffect(() => {
    if (piece !== null && mine && !mine.includes(piece)) {
      setPiece(null);
    }
  }, [piece, mine]);

  // Rotate with R and flip with F. Both are also buttons; the keys are what
  // makes the game playable at speed.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(input|textarea|select)$/i.test(target?.tagName ?? "")
      ) {
        return;
      }
      if (event.key === "r" || event.key === "R") {
        setRotation((value) => (value + 1) % 4);
      }
      if (event.key === "f" || event.key === "F") {
        setFlipped((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const offsets = useMemo(() => {
    if (!board || piece === null) {
      return [];
    }
    return transform(board.shapes[piece], rotation, flipped);
  }, [board, piece, rotation, flipped]);

  if (!board) {
    return null;
  }

  const preview = hover === null ? [] : cellsAt(offsets, hover, board.size);

  const place = (cell: number) => {
    if (piece === null || !isMyTurn) {
      return;
    }
    const cells = cellsAt(offsets, cell, board.size);
    if (cells.length !== offsets.length) {
      return;
    }
    onMove(`place:${piece}:${cells.join(",")}`);
  };

  return (
    <div className="ct-blokus">
      <div
        className="ct-board ct-blokus-board"
        aria-label="Blokus tahtası"
        onMouseLeave={() => setHover(null)}
      >
        {board.cells.map((owner, index) => (
          <button
            key={index}
            type="button"
            className="ct-blokus-cell"
            data-owner={owner === -1 ? undefined : owner}
            data-corner={cornerSeat(board.corners, index)}
            data-last={board.lastCells.includes(index) ? "true" : undefined}
            data-preview={preview.includes(index) ? "true" : undefined}
            data-preview-seat={preview.includes(index) ? mySeat : undefined}
            disabled={!isMyTurn || isBusy || piece === null}
            onMouseEnter={() => setHover(index)}
            onClick={() => place(index)}
            aria-label={`${(index % board.size) + 1}. sütun ${Math.floor(index / board.size) + 1}. sıra`}
          />
        ))}
      </div>

      <div className="ct-blokus-controls">
        <Button
          size="small"
          icon={<RedoOutlined />}
          onClick={() => setRotation((value) => (value + 1) % 4)}
        >
          Döndür (R)
        </Button>
        <Button
          size="small"
          icon={<SwapOutlined />}
          onClick={() => setFlipped((value) => !value)}
        >
          Aynala (F)
        </Button>
        {/* Only offered when there is genuinely nothing to play: passing is
            permanent in Blokus, so an eager button is a resignation. */}
        <Button
          size="small"
          danger
          disabled={!isMyTurn || isBusy}
          onClick={() => onMove("pass")}
        >
          Pas
        </Button>
      </div>

      <div className="ct-blokus-tray" aria-label="Taşların">
        {(mine ?? []).map((index) => (
          <button
            key={index}
            type="button"
            className="ct-blokus-piece"
            data-selected={piece === index ? "true" : undefined}
            disabled={!isMyTurn || isBusy}
            onClick={() => setPiece(index)}
            aria-label={`${index + 1}. taş`}
          >
            <PieceGlyph shape={board.shapes[index]} seat={mySeat} />
          </button>
        ))}
        {mine && mine.length === 0 ? (
          <span className="ct-blokus-tray-empty">Bütün taşlarını oynadın.</span>
        ) : null}
      </div>
    </div>
  );
}

/** The scores, and who is already out. */
export function BlokusAside({ table }: VersusViewProps) {
  const board = table.blokus;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Puanlar</span>
      <ul className="ct-versus-scorelist">
        {board.scores.map((score, seat) => (
          <li key={seat} className="ct-versus-scorerow" data-out={board.passed[seat] ? "true" : undefined}>
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{score}</strong>
            <span className="ct-versus-scorenote">
              {board.passed[seat] ? "pas" : `${board.remaining[seat].length} taş`}
            </span>
          </li>
        ))}
      </ul>
      <p className="ct-versus-panel-note">
        İlk taş köşeni örtmeli. Sonraki her taş kendi taşlarından birine köşeden
        değmeli, kenardan değmemeli.
      </p>
    </div>
  );
}

/** A tray piece, drawn in its own little grid. */
function PieceGlyph({ shape, seat }: { shape: number[]; seat: number }) {
  const points = pairs(shape);
  const width = Math.max(...points.map((point) => point.x)) + 1;
  const height = Math.max(...points.map((point) => point.y)) + 1;

  return (
    <span
      className="ct-blokus-glyph"
      style={{
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: width * height }, (_, index) => {
        const x = index % width;
        const y = Math.floor(index / width);
        const filled = points.some((point) => point.x === x && point.y === y);
        return (
          <span
            key={index}
            className="ct-blokus-glyph-cell"
            data-owner={filled ? seat : undefined}
          />
        );
      })}
    </span>
  );
}

function pairs(flat: readonly number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push({ x: flat[index], y: flat[index + 1] });
  }
  return points;
}

/**
 * The shape after however many turns and an optional mirror, normalised so its
 * top-left corner sits at the origin.
 *
 * The same two transforms the server generates its orientation table from, in
 * the same order -- but the ORDER does not have to match, and that is the point
 * of sending cells rather than an index: whatever this produces, the server
 * checks it against every symmetry of the piece.
 */
function transform(flat: readonly number[], rotation: number, flipped: boolean): Point[] {
  let points = pairs(flat);

  if (flipped) {
    points = points.map((point) => ({ x: -point.x, y: point.y }));
  }
  for (let turn = 0; turn < rotation % 4; turn++) {
    points = points.map((point) => ({ x: -point.y, y: point.x }));
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
}

/**
 * The board cells a shape would fill with its origin at `cell`.
 *
 * Returns FEWER cells than the shape has when it runs off an edge, which is
 * what the caller checks: a placement that has lost squares is one that would
 * have wrapped, and a wrapped piece is not the piece it claims to be.
 */
function cellsAt(offsets: readonly Point[], cell: number, size: number): number[] {
  const originX = cell % size;
  const originY = Math.floor(cell / size);

  const cells: number[] = [];
  for (const point of offsets) {
    const x = originX + point.x;
    const y = originY + point.y;
    if (x < 0 || y < 0 || x >= size || y >= size) {
      continue;
    }
    cells.push(y * size + x);
  }
  return cells;
}

function cornerSeat(corners: readonly number[], cell: number): number | undefined {
  const seat = corners.indexOf(cell);
  return seat < 0 ? undefined : seat;
}
