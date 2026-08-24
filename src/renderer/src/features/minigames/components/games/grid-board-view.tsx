import { useState, type CSSProperties } from "react";
import type { VersusViewProps } from "../../versus-view";

/**
 * The five grid games: XOX, Connect Four, Gomoku, the wider drop board and the
 * three-handed one.
 *
 * Driven entirely off the board's own dimensions, which is why five titles need
 * one component: what differs between them is four numbers in the server's
 * catalogue, and every one of those arrives inside the board.
 *
 * Its own module rather than a corner of versus-board.tsx, so the registry can
 * import it without importing the shell that imports the registry.
 */
export function GridBoardView({
  table,
  mySeat,
  isMyTurn,
  isBusy,
  onCell,
}: VersusViewProps) {
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  const board = table.grid;
  if (!board) {
    return null;
  }

  // Presentation, not a rule: under gravity a whole column is one target, so
  // the hover highlight follows the column rather than the cell. The server
  // still decides where the mark lands.
  const hasGravity =
    table.game === "connect4" || table.game === "connect5" || table.game === "connect4trio";

  return (
    <div
      className="ct-board ct-versus-board"
      data-game={table.game}
      data-state={boardState(table, mySeat)}
      // Gomoku is 15x15 and XOX is 3x3, so the cell styling has to know which
      // end of that range it is at rather than assuming a Connect Four disc.
      data-scale={board.columns >= 11 ? "small" : board.columns >= 7 ? "medium" : "large"}
      aria-label="Oyun tahtası"
      onMouseLeave={() => setHoveredColumn(null)}
    >
      {board.cells.map((owner, index) => {
        const column = index % board.columns;
        const row = Math.floor(index / board.columns);
        const isPlayable = isMyTurn && owner === -1;
        const isLanded = board.lastCell === index;

        return (
          <button
            key={index}
            type="button"
            className="ct-versus-cell"
            data-last={isLanded ? "true" : undefined}
            data-winning={(board.winningCells ?? []).includes(index) ? "true" : undefined}
            data-target={
              isPlayable && hasGravity && hoveredColumn === column ? "true" : undefined
            }
            // Disabled rather than merely ignored, so the cursor says so before
            // the click and the server never sees a doomed move.
            disabled={!isPlayable || isBusy}
            onMouseEnter={() => setHoveredColumn(column)}
            onClick={() => onCell(index)}
            aria-label={`${column + 1}. sütun, ${row + 1}. sıra`}
          >
            {/* The mark is a child rather than the slot itself, so it can move
                into an empty hole that stays put. Keyed on the owner so a mark
                landing in a slot is a mount, which is what replays the drop. */}
            {owner === -1 ? null : (
              <span
                key={owner}
                className="ct-versus-disc"
                data-owner={owner}
                data-landed={isLanded ? "true" : undefined}
                // How far it fell, in rows, for the gravity games. A disc enters
                // at the top of its column and stops where it stops; a pop in
                // place would say nothing about which column it went down.
                style={
                  isLanded && hasGravity
                    ? ({ "--drop": String(row + 1) } as CSSProperties)
                    : undefined
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The board wears the result too, not only the line under it: a win that is
 * only written down is a win somebody misses.
 *
 * From the AUDIENCE there is no loss to wear. A spectator's seat is -1, which is
 * nobody's winning seat, so reading the result through `mySeat` alone would
 * shake the board red at somebody who was not playing.
 */
function boardState(
  table: VersusViewProps["table"],
  mySeat: number,
): string | undefined {
  if (table.draw) {
    return "draw";
  }
  if (table.winner === null) {
    return undefined;
  }
  if (mySeat < 0) {
    return "won";
  }
  return table.winner === mySeat ? "won" : "lost";
}
