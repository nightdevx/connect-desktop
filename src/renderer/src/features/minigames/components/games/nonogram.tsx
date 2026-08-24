import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_NONOGRAM } from "../../difficulty";
import { createNonogram, isNonogramSolved, runsOf } from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/** 0 blank, 1 filled, 2 crossed out. */
type Mark = 0 | 1 | 2;

/**
 * Nonogram. The clues down the side and across the top are run lengths; fill in
 * the picture they describe.
 *
 * Crosses are the player's own notes and are NOT graded -- isNonogramSolved
 * compares the filled cells only. Marking somebody wrong for how they kept
 * track would be grading their handwriting.
 *
 * A clue line goes dim once the row or column matches it. That is not a hint:
 * it says exactly what the player could work out by counting, and it is what
 * makes a 15x15 grid finishable without recounting every line after every mark.
 */
export function Nonogram({ difficulty }: MinigameBoardProps) {
  const { size, density } = RULES_NONOGRAM[difficulty];

  const [puzzle, setPuzzle] = useState(() => createNonogram(size, density));
  const [marks, setMarks] = useState<Mark[]>(() => new Array<Mark>(size * size).fill(0));
  const [seconds, setSeconds] = useState(0);

  const hasWon = useMemo(() => isNonogramSolved(marks, puzzle), [marks, puzzle]);
  const isRecord = useRecordRun(scoreKey("nonogram", difficulty), hasWon, seconds);

  useEffect(() => {
    if (hasWon) {
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [hasWon]);

  // Which clue lines are already satisfied. Recomputed from the marks rather
  // than tracked, so undoing a mark un-dims its line without any bookkeeping.
  const doneRows = useMemo(
    () =>
      puzzle.rowClues.map((clue, row) => {
        const line = marks.slice(row * size, row * size + size).map((mark) => mark === 1);
        return sameRuns(runsOf(line), clue);
      }),
    [marks, puzzle.rowClues, size],
  );

  const doneColumns = useMemo(
    () =>
      puzzle.columnClues.map((clue, column) => {
        const line: boolean[] = [];
        for (let row = 0; row < size; row++) {
          line.push(marks[row * size + column] === 1);
        }
        return sameRuns(runsOf(line), clue);
      }),
    [marks, puzzle.columnClues, size],
  );

  const cycle = (index: number, backwards: boolean) => {
    if (hasWon) {
      return;
    }
    setMarks((current) => {
      const next = [...current];
      // Left click walks blank -> filled -> crossed; right click walks the other
      // way, so a misclick is undone by the same gesture reversed.
      const order: Mark[] = backwards ? [0, 2, 1] : [0, 1, 2];
      const position = order.indexOf(current[index]);
      next[index] = order[(position + 1) % order.length];
      return next;
    });
  };

  const reset = () => {
    setPuzzle(createNonogram(size, density));
    setMarks(new Array<Mark>(size * size).fill(0));
    setSeconds(0);
  };

  const filled = marks.filter((mark) => mark === 1).length;
  const target = puzzle.solution.filter(Boolean).length;

  return (
    <GameShell
      columns={size}
      rows={size}
      hud={[
        { label: "Süre", value: `${seconds} sn` },
        {
          label: "Dolu",
          value: `${filled}/${target}`,
          tone: hasWon ? "record" : undefined,
        },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: "Sol tık doldurur, sağ tık çarpı koyar. Çarpılar not — puanlanmaz.",
        tone: hasWon ? "done" : "idle",
      }}
      overlay={
        hasWon ? (
          <GameOutcome
            tone="won"
            title="Resim çıktı"
            detail={`${seconds} saniye`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      {/* The clue gutters are part of the board rather than of the shell: they
          have to line up with the cells exactly, and the only thing that knows
          the cell size is the grid itself. */}
      <div
        className="ct-nonogram"
        style={{ "--nonogram-size": String(size) } as CSSProperties}
        data-state={hasWon ? "won" : undefined}
      >
        <div className="ct-nonogram-corner" aria-hidden="true" />

        <div className="ct-nonogram-columns">
          {puzzle.columnClues.map((clue, column) => (
            <div
              key={column}
              className="ct-nonogram-clue"
              data-done={doneColumns[column] ? "true" : undefined}
            >
              {clue.map((run, index) => (
                <span key={index}>{run}</span>
              ))}
            </div>
          ))}
        </div>

        <div className="ct-nonogram-rows">
          {puzzle.rowClues.map((clue, row) => (
            <div
              key={row}
              className="ct-nonogram-clue"
              data-row="true"
              data-done={doneRows[row] ? "true" : undefined}
            >
              {clue.map((run, index) => (
                <span key={index}>{run}</span>
              ))}
            </div>
          ))}
        </div>

        <div className="ct-board ct-nonogram-board" aria-label="Nonogram tahtası">
          {marks.map((mark, index) => {
            const column = index % size;
            const row = Math.floor(index / size);

            return (
              <button
                key={index}
                type="button"
                className="ct-nonogram-cell"
                data-mark={mark === 0 ? undefined : mark}
                data-block-x={column % 5 === 4 && column !== size - 1 ? "true" : undefined}
                data-block-y={row % 5 === 4 && row !== size - 1 ? "true" : undefined}
                onClick={() => cycle(index, false)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cycle(index, true);
                }}
                aria-label={`${column + 1}. sütun ${row + 1}. sıra`}
              />
            );
          })}
        </div>
      </div>
    </GameShell>
  );
}

function sameRuns(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((run, index) => run === right[index]);
}
