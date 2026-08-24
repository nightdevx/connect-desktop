import type { CSSProperties } from "react";
import type { VersusViewProps } from "../../versus-view";

/**
 * Dots and boxes, two to four.
 *
 * The board is ONE css grid of alternating tracks -- dot, edge, dot, edge -- so
 * a dot, a horizontal edge, a vertical edge and a box all sit in it without any
 * of them being positioned absolutely. The alternative is four overlapping
 * layers, which is four things to keep aligned when the cell size changes.
 *
 * A 5x5 field is 11 tracks each way: 6 dots and 5 gaps.
 */
export function BoxesBoard({ table, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.boxes;
  if (!board) {
    return null;
  }

  const tracks = board.columns * 2 + 1;
  const cells: JSX.Element[] = [];

  for (let row = 0; row < board.rows * 2 + 1; row++) {
    for (let column = 0; column < tracks; column++) {
      const isDotRow = row % 2 === 0;
      const isDotColumn = column % 2 === 0;
      const key = `${row}-${column}`;

      if (isDotRow && isDotColumn) {
        cells.push(<span key={key} className="ct-boxes-dot" aria-hidden="true" />);
        continue;
      }

      if (isDotRow) {
        // A horizontal edge: between two dots on a dot row.
        const index = (row / 2) * board.columns + (column - 1) / 2;
        cells.push(
          <Edge
            key={key}
            kind="h"
            index={index}
            owner={board.horizontal[index]}
            isLast={board.lastEdge === `h:${index}`}
            isMyTurn={isMyTurn}
            isBusy={isBusy}
            onMove={onMove}
          />,
        );
        continue;
      }

      if (isDotColumn) {
        const index = ((row - 1) / 2) * (board.columns + 1) + column / 2;
        cells.push(
          <Edge
            key={key}
            kind="v"
            index={index}
            owner={board.vertical[index]}
            isLast={board.lastEdge === `v:${index}`}
            isMyTurn={isMyTurn}
            isBusy={isBusy}
            onMove={onMove}
          />,
        );
        continue;
      }

      // The middle of four edges: a box.
      const index = ((row - 1) / 2) * board.columns + (column - 1) / 2;
      const owner = board.boxes[index];
      cells.push(
        <span
          key={key}
          className="ct-boxes-cell"
          data-owner={owner === -1 ? undefined : owner}
          aria-hidden="true"
        />,
      );
    }
  }

  return (
    <div
      className="ct-board ct-boxes-board"
      style={{ "--boxes-tracks": String(tracks) } as CSSProperties}
      aria-label="Nokta kutu tahtası"
    >
      {cells}
    </div>
  );
}

function Edge({
  kind,
  index,
  owner,
  isLast,
  isMyTurn,
  isBusy,
  onMove,
}: {
  kind: "h" | "v";
  index: number;
  owner: number;
  isLast: boolean;
  isMyTurn: boolean;
  isBusy: boolean;
  onMove: (move: string) => void;
}) {
  const isFree = owner === -1;

  return (
    <button
      type="button"
      className="ct-boxes-edge"
      data-kind={kind}
      data-owner={isFree ? undefined : owner}
      data-last={isLast ? "true" : undefined}
      // Disabled rather than merely ignored, so the cursor says so before the
      // click and the server never sees a doomed move.
      disabled={!isFree || !isMyTurn || isBusy}
      onClick={() => onMove(`${kind}:${index}`)}
      aria-label={`${kind === "h" ? "Yatay" : "Dikey"} çizgi ${index + 1}`}
    />
  );
}
