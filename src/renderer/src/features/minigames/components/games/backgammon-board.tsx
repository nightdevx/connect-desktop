import { useState } from "react";
import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const BAR = 24;
const OFF = 25;

/**
 * Tavla.
 *
 * Two clicks: pick a point, then pick where the checker goes. The legal moves
 * arrive with the board as "from-to" strings, so the first click filters that
 * list and the second one sends the move it found -- this decides nothing about
 * whether a move is legal and cannot, which is the same arrangement chess uses.
 *
 * The two halves of the board run in opposite directions, so the top row is
 * points 12..23 left to right and the bottom row is 11..0 left to right. That
 * is the physical board: seat 0 walks its checkers along the top and down the
 * bottom towards zero, and seat 1 does the mirror.
 */
export function BackgammonBoard({ table, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.gammon;
  const [from, setFrom] = useState<number | null>(null);

  if (!board) {
    return null;
  }

  const targetsFrom = (origin: number) =>
    board.legalMoves
      .filter((move) => Number(move.split("-")[0]) === origin)
      .map((move) => Number(move.split("-")[1]));

  const origins = new Set(board.legalMoves.map((move) => Number(move.split("-")[0])));
  const targets = from === null ? [] : targetsFrom(from);

  const pick = (point: number) => {
    if (!isMyTurn) {
      return;
    }
    if (from !== null && targets.includes(point)) {
      onMove(`move:${from}:${point}`);
      setFrom(null);
      return;
    }
    setFrom(origins.has(point) ? point : null);
  };

  const point = (index: number) => (
    <button
      key={index}
      type="button"
      className="ct-gammon-point"
      data-parity={index % 2}
      data-owner={board.count[index] === 0 ? undefined : board.owner[index]}
      data-from={from === index ? "true" : undefined}
      data-target={targets.includes(index) ? "true" : undefined}
      data-last={board.lastMove.split("-")[1] === String(index) ? "true" : undefined}
      disabled={!isMyTurn || isBusy || (!origins.has(index) && !targets.includes(index))}
      onClick={() => pick(index)}
      aria-label={`${index + 1}. hane, ${board.count[index]} pul`}
    >
      {/* Five stacked checkers and then a number: a point can hold fifteen, and
          fifteen drawn circles do not fit in a triangle. */}
      {Array.from({ length: Math.min(board.count[index], 5) }, (_, slot) => (
        <span key={slot} className="ct-gammon-checker" data-owner={board.owner[index]} />
      ))}
      {board.count[index] > 5 ? (
        <span className="ct-gammon-overflow">{board.count[index]}</span>
      ) : null}
    </button>
  );

  return (
    <div className="ct-gammon">
      <div className="ct-board ct-gammon-board" aria-label="Tavla tahtası">
        <div className="ct-gammon-row" data-half="top">
          {Array.from({ length: 12 }, (_, offset) => point(12 + offset))}
        </div>

        <div className="ct-gammon-bar" aria-label="Kırık pullar">
          {board.bar.map((count, seat) => (
            <button
              key={seat}
              type="button"
              className="ct-gammon-barslot"
              data-owner={seat}
              data-from={from === BAR ? "true" : undefined}
              // Only your own bar is clickable, and only when entering is
              // actually one of the moves on offer.
              disabled={!isMyTurn || isBusy || count === 0 || !origins.has(BAR)}
              onClick={() => pick(BAR)}
              aria-label={`${table.players[seat]?.username ?? seat + 1} kırık: ${count}`}
            >
              {count > 0 ? count : ""}
            </button>
          ))}
        </div>

        <div className="ct-gammon-row" data-half="bottom">
          {Array.from({ length: 12 }, (_, offset) => point(11 - offset))}
        </div>
      </div>

      <div className="ct-gammon-actions">
        <span className="ct-gammon-dice">
          {board.roll.length === 0 ? "—" : null}
          {spentFlags(expandRoll(board.roll), board.dice).map(({ die, spent }, index) => (
            <span
              key={index}
              className="ct-gammon-die"
              // A die that has been played goes dim, which is how a player sees
              // what they have left without counting.
              data-spent={spent ? "true" : undefined}
            >
              {DIE_FACES[die]}
            </span>
          ))}
        </span>

        <Button
          type="primary"
          disabled={!isMyTurn || board.rolled || isBusy}
          onClick={() => onMove("roll")}
        >
          Zar at
        </Button>

        <Button
          // Bearing off has no square to click, so it is a button -- and it is
          // only live once a point is selected that can actually bear off.
          disabled={!isMyTurn || isBusy || from === null || !targets.includes(OFF)}
          onClick={() => {
            if (from === null) {
              return;
            }
            onMove(`move:${from}:${OFF}`);
            setFrom(null);
          }}
        >
          Topla ({board.off.join(" / ")})
        </Button>
      </div>
    </div>
  );
}

/**
 * Which of the rolled dice have already been played.
 *
 * `roll` is what came up and `dice` is what is left, so the difference is what
 * was spent -- but a double is four identical faces, so this has to consume the
 * remaining list rather than test membership. Testing membership marks all four
 * of a double as unspent until the last one goes.
 */
/**
 * A double is four moves, not two. `roll` carries the two faces that came up;
 * this is the list of MOVES they bought, which is what the player counts down.
 */
function expandRoll(roll: readonly number[]): number[] {
  if (roll.length === 2 && roll[0] === roll[1]) {
    return [roll[0], roll[0], roll[0], roll[0]];
  }
  return [...roll];
}

function spentFlags(
  roll: readonly number[],
  remaining: readonly number[],
): { die: number; spent: boolean }[] {
  const pool = [...remaining];

  return roll.map((die) => {
    const position = pool.indexOf(die);
    if (position < 0) {
      return { die, spent: true };
    }
    pool.splice(position, 1);
    return { die, spent: false };
  });
}
