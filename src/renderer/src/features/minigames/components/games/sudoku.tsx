import { useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_SUDOKU } from "../../difficulty";
import {
  SUDOKU_SIZE,
  createSudoku,
  isSudokuSolved,
  sudokuConflicts,
} from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/**
 * Sudoku. The record is the clock, so the clock is the only piece of state that
 * is not derived.
 *
 * Conflicts are shown as you type rather than at the end. Hiding them would
 * make the game "fill in eighty-one cells and find out", and the version people
 * actually play on paper has an eraser.
 */
export function Sudoku({ difficulty }: MinigameBoardProps) {
  const { clues } = RULES_SUDOKU[difficulty];

  const [puzzle, setPuzzle] = useState(() => createSudoku(clues));
  const [grid, setGrid] = useState<number[]>(() => [...puzzle.puzzle]);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  const hasWon = useMemo(() => isSudokuSolved(grid), [grid]);
  const conflicts = useMemo(() => sudokuConflicts(grid), [grid]);
  const isRecord = useRecordRun(scoreKey("sudoku", difficulty), hasWon, seconds);

  const filled = grid.filter((value) => value !== 0).length;

  // Stopped on the winning render rather than one tick later, so the number on
  // the result card is the number that was recorded.
  useEffect(() => {
    if (hasWon) {
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [hasWon]);

  // Typing anywhere fills the selected cell. Bound to the window for the same
  // reason use-arrow-keys is: a grid of buttons that has to be clicked before
  // the keyboard works is a grid nobody uses the keyboard on.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selected === null || puzzle.fixed[selected]) {
        return;
      }

      if (event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        setGrid((current) => {
          const next = [...current];
          next[selected] = Number(event.key);
          return next;
        });
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        event.preventDefault();
        setGrid((current) => {
          const next = [...current];
          next[selected] = 0;
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, puzzle.fixed]);

  const reset = () => {
    const dealt = createSudoku(clues);
    setPuzzle(dealt);
    setGrid([...dealt.puzzle]);
    setSelected(null);
    setSeconds(0);
  };

  const write = (value: number) => {
    if (selected === null || puzzle.fixed[selected]) {
      return;
    }
    setGrid((current) => {
      const next = [...current];
      next[selected] = value;
      return next;
    });
  };

  return (
    <GameShell
      columns={SUDOKU_SIZE}
      rows={SUDOKU_SIZE}
      hud={[
        { label: "Süre", value: `${seconds} sn` },
        {
          label: "Dolu",
          value: `${filled}/81`,
          tone: conflicts.size > 0 ? "alert" : undefined,
        },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text:
          conflicts.size > 0
            ? "Kırmızı kareler birbiriyle çakışıyor."
            : "Bir kare seç, 1-9 yaz. Silmek için Backspace.",
        tone: hasWon ? "done" : conflicts.size > 0 ? "them" : "idle",
      }}
      aside={
        <div className="ct-sudoku-pad" aria-label="Rakam tuşları">
          {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              type="button"
              className="ct-sudoku-key"
              disabled={selected === null || puzzle.fixed[selected]}
              onClick={() => write(value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            className="ct-sudoku-key"
            data-clear="true"
            disabled={selected === null || puzzle.fixed[selected]}
            onClick={() => write(0)}
          >
            Sil
          </button>
        </div>
      }
      overlay={
        hasWon ? (
          <GameOutcome
            tone="won"
            title="Çözüldü"
            detail={`${seconds} saniye`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div className="ct-board ct-sudoku-board" aria-label="Sudoku tahtası">
        {grid.map((value, index) => {
          const column = index % SUDOKU_SIZE;
          const row = Math.floor(index / SUDOKU_SIZE);
          // The 3x3 boxes are drawn with a heavier border on every third cell,
          // which is what makes the grid readable at all.
          const boxEdgeX = column % 3 === 2 && column !== SUDOKU_SIZE - 1;
          const boxEdgeY = row % 3 === 2 && row !== SUDOKU_SIZE - 1;

          return (
            <button
              key={index}
              type="button"
              className="ct-sudoku-cell"
              data-fixed={puzzle.fixed[index] ? "true" : undefined}
              data-selected={selected === index ? "true" : undefined}
              data-conflict={conflicts.has(index) ? "true" : undefined}
              // Highlighting every copy of the selected number is the one piece
              // of help that is not a hint: it says nothing the player cannot
              // see, it just saves them scanning for it.
              data-peer={
                selected !== null &&
                grid[selected] !== 0 &&
                value === grid[selected] &&
                index !== selected
                  ? "true"
                  : undefined
              }
              data-box-x={boxEdgeX ? "true" : undefined}
              data-box-y={boxEdgeY ? "true" : undefined}
              onClick={() => setSelected(index)}
              aria-label={`${column + 1}. sütun ${row + 1}. sıra${value ? `, ${value}` : ", boş"}`}
            >
              {value === 0 ? "" : value}
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
