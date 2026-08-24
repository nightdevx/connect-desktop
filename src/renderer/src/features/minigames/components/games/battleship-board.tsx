import { useState } from "react";
import { Button } from "antd";
import { RedoOutlined } from "@ant-design/icons";
import type { VersusViewProps } from "../../versus-view";
import { useMinigameCue } from "../../use-minigame-cue";

const COLUMN_LETTERS = "ABCDEFGHIJ";

/**
 * Amiral Battı.
 *
 * Two grids side by side: your own water with your fleet on it, and the enemy's
 * with your shots on it. Both are drawn from the same table -- `shots` is
 * public both ways, because a hit is announced out loud, and the only thing the
 * server hides is where an enemy ship IS until it sinks.
 *
 * The placement phase has no turn: both admirals lay out at once, the table's
 * turn is -1, and the hub reads that as "anybody seated may move". So this
 * shows the placement board to whoever has not pressed Hazır, whatever the
 * other player is doing.
 */
export function BattleshipBoard({
  table,
  mySeat,
  isMyTurn,
  isBusy,
  onMove,
}: VersusViewProps) {
  const board = table.fleet;
  const [ship, setShip] = useState(0);
  const [vertical, setVertical] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // Both sides' shells, so incoming fire is as audible as your own. Counted
  // rather than event-driven, because a snapshot is all the client gets: a
  // number that went up is a shell that landed.
  const shots = board ? board.shots.flat() : [];
  useMinigameCue("blast", shots.filter((shot) => shot === 2).length);
  useMinigameCue("splash", shots.filter((shot) => shot === 1).length);

  if (!board) {
    return null;
  }

  const enemy = mySeat < 0 ? 1 : 1 - mySeat;
  const placing = board.phase === "placing";
  const myShips = mySeat >= 0 ? board.ships[mySeat] ?? [] : [];
  const isReady = mySeat >= 0 && board.ready[mySeat];

  // Where the piece being placed would go. Cut short at the edge, which is what
  // marks the placement as impossible before it is clicked.
  const ghostSize = myShips[ship]?.size ?? 0;
  const ghost =
    placing && !isReady && hover !== null
      ? shipCells(hover, ghostSize, vertical, board.size)
      : [];
  // A ghost that lost squares to the edge is a placement the server will
  // refuse, so it is drawn in the refusing colour before it is clicked.
  const ghostBad = ghost.length > 0 && ghost.length < ghostSize;

  return (
    <div className="ct-board ct-fleet-board" aria-label="Amiral battı">
      <div className="ct-fleet-grids">
        <Grid
          title={placing ? "Filonu diz" : "Senin suların"}
          size={board.size}
          // Your own water: your ships, and the enemy's shots at them.
          cell={(index) => {
            const hull = myShips.find((entry) => entry.cells.includes(index));
            return {
              ship: Boolean(hull),
              sunk: Boolean(hull?.sunk),
              // The enemy's shots at YOUR water, which is public: a hit is
              // announced the moment it lands.
              shot: board.shots[enemy]?.[index] ?? 0,
              ghost: ghost.includes(index),
              ghostBad,
              ...(hull ? hullPartOf(hull.cells, index) : {}),
            };
          }}
          onEnter={placing && !isReady ? setHover : undefined}
          onLeave={() => setHover(null)}
          onClick={
            placing && !isReady
              ? (index) => onMove(`place:${ship}:${index}:${vertical ? 1 : 0}`)
              : undefined
          }
          disabled={isBusy || isReady || !placing}
        />

        <Grid
          title="Rakip suları"
          size={board.size}
          cell={(index) => {
            const sunkShip = board.ships[enemy]?.find(
              (entry) => entry.sunk && entry.cells.includes(index),
            );
            return {
              // Only a SUNK enemy ship is drawn, and only because the server
              // sent its squares -- which it does only once it has sunk.
              ship: Boolean(sunkShip),
              sunk: Boolean(sunkShip),
              shot: mySeat >= 0 ? board.shots[mySeat]?.[index] ?? 0 : 0,
              ghost: false,
              ghostBad: false,
              ...(sunkShip ? hullPartOf(sunkShip.cells, index) : {}),
            };
          }}
          onClick={
            !placing && isMyTurn && mySeat >= 0
              ? (index) => onMove(`fire:${index}`)
              : undefined
          }
          disabled={placing || !isMyTurn || isBusy}
        />
      </div>

      {placing && mySeat >= 0 ? (
        <div className="ct-fleet-tray">
          {isReady ? (
            <p className="ct-fleet-waiting">
              Hazırsın. Rakibin filosunu dizmesi bekleniyor…
            </p>
          ) : (
            <>
              <div className="ct-fleet-ships">
                {myShips.map((entry, index) => (
                  <button
                    key={index}
                    type="button"
                    className="ct-fleet-shipbutton"
                    data-selected={ship === index ? "true" : undefined}
                    data-placed={entry.cells.length > 0 ? "true" : undefined}
                    onClick={() => setShip(index)}
                    aria-label={`${entry.size} kareli gemi`}
                  >
                    {Array.from({ length: entry.size }, (_, slot) => (
                      <span key={slot} className="ct-fleet-shipcell" />
                    ))}
                  </button>
                ))}
              </div>

              <div className="ct-fleet-controls">
                <Button
                  size="small"
                  icon={<RedoOutlined />}
                  onClick={() => setVertical((value) => !value)}
                >
                  {vertical ? "Dikey" : "Yatay"}
                </Button>
                <Button
                  size="small"
                  disabled={isBusy || myShips[ship]?.cells.length === 0}
                  onClick={() => onMove(`clear:${ship}`)}
                >
                  Kaldır
                </Button>
                <Button
                  type="primary"
                  disabled={isBusy || myShips.some((entry) => entry.cells.length === 0)}
                  onClick={() => onMove("ready")}
                >
                  Hazır
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Ships left afloat, on both sides. */
export function BattleshipAside({ table, mySeat }: VersusViewProps) {
  const board = table.fleet;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Filolar</span>
      <ul className="ct-versus-scorelist">
        {board.remaining.map((afloat, seat) => (
          <li key={seat} className="ct-versus-scorerow">
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
              {seat === mySeat ? " (sen)" : ""}
            </span>
            <strong>{afloat}/5</strong>
          </li>
        ))}
      </ul>

      <div className="ct-fleet-legend">
        {board.sizes.map((size, index) => {
          const mine = mySeat >= 0 ? board.ships[mySeat]?.[index] : undefined;
          return (
            <span key={index} className="ct-fleet-legend-row" data-sunk={mine?.sunk ? "true" : undefined}>
              {Array.from({ length: size }, (_, slot) => (
                <span key={slot} className="ct-fleet-shipcell" />
              ))}
              <span>{size}</span>
            </span>
          );
        })}
      </div>

      <p className="ct-versus-panel-note">
        Filoyu ikiniz aynı anda dizersiniz. İkisi de Hazır deyince atışlar başlar
        ve sıra dönüşümlü ilerler — isabet ekstra atış kazandırmaz.
      </p>
    </div>
  );
}

interface CellState {
  ship: boolean;
  sunk: boolean;
  /** 0 not fired at, 1 miss, 2 hit. */
  shot: number;
  ghost: boolean;
  ghostBad: boolean;
  /**
   * Where this square sits along its hull, and which way the hull runs.
   *
   * Only presentation, and the reason it exists: five squares of identical grey
   * do not read as a ship, they read as five squares. Told which end is which,
   * the stylesheet rounds the bow, squares the stern and runs the deck plating
   * along the hull, and the same five squares read as one vessel. A one-square
   * ship is "solo" -- both ends at once.
   */
  hull?: "bow" | "mid" | "stern" | "solo";
  hullVertical?: boolean;
}

/**
 * Which part of its hull a square is, from the ship's own cell list.
 *
 * The list is in placement order, so its first entry is the bow and its last is
 * the stern; the direction comes from the step between the first two, which is
 * 1 across and a whole row down. A ship of one is both ends.
 */
function hullPartOf(
  cells: number[],
  index: number,
): { hull: CellState["hull"]; hullVertical: boolean } {
  const at = cells.indexOf(index);
  const vertical = cells.length > 1 && cells[1] - cells[0] !== 1;

  if (cells.length === 1) {
    return { hull: "solo", hullVertical: vertical };
  }
  if (at === 0) {
    return { hull: "bow", hullVertical: vertical };
  }
  if (at === cells.length - 1) {
    return { hull: "stern", hullVertical: vertical };
  }
  return { hull: "mid", hullVertical: vertical };
}

function Grid({
  title,
  size,
  cell,
  onEnter,
  onLeave,
  onClick,
  disabled,
}: {
  title: string;
  size: number;
  cell: (index: number) => CellState;
  onEnter?: (index: number) => void;
  onLeave?: () => void;
  onClick?: (index: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="ct-fleet-grid">
      <span className="ct-fleet-grid-title">{title}</span>

      <div className="ct-fleet-labels" aria-hidden="true">
        <span />
        {Array.from({ length: size }, (_, column) => (
          <span key={column}>{COLUMN_LETTERS[column]}</span>
        ))}
      </div>

      <div className="ct-fleet-body">
        <div className="ct-fleet-rownumbers" aria-hidden="true">
          {Array.from({ length: size }, (_, row) => (
            <span key={row}>{row + 1}</span>
          ))}
        </div>

        <div
          className="ct-fleet-cells"
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
          onMouseLeave={onLeave}
        >
          {Array.from({ length: size * size }, (_, index) => {
            const state = cell(index);

            return (
              <button
                key={index}
                type="button"
                className="ct-fleet-cell"
                data-ship={state.ship ? "true" : undefined}
                data-sunk={state.sunk ? "true" : undefined}
                data-shot={state.shot === 0 ? undefined : state.shot}
                data-ghost={state.ghost ? (state.ghostBad ? "bad" : "true") : undefined}
                data-hull={state.hull}
                data-hull-axis={state.hull ? (state.hullVertical ? "v" : "h") : undefined}
                disabled={disabled || !onClick || state.shot !== 0}
                onMouseEnter={() => onEnter?.(index)}
                onClick={() => onClick?.(index)}
                aria-label={`${COLUMN_LETTERS[index % size]}${Math.floor(index / size) + 1}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The squares a ship would cover. Returns FEWER than `size` when it runs off an
 * edge, which is what marks the placement as impossible -- and is why the guard
 * is on the column and not on the flat index: 19 and 20 are adjacent numbers
 * and opposite sides of the board.
 */
function shipCells(cell: number, size: number, vertical: boolean, board: number): number[] {
  const x = cell % board;
  const y = Math.floor(cell / board);
  const cells: number[] = [];

  for (let step = 0; step < size; step++) {
    const nextX = vertical ? x : x + step;
    const nextY = vertical ? y + step : y;
    if (nextX >= board || nextY >= board) {
      break;
    }
    cells.push(nextY * board + nextX);
  }

  return cells;
}
