import { useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_FLOOD } from "../../difficulty";
import { createFlood, floodFill, floodedCount, isFlooded } from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/**
 * Flood It. The top-left corner is yours; pick a colour and everything
 * connected to it becomes that colour. Take the whole board.
 *
 * The progress figure is the point of the HUD here. Without it the game gives
 * no feedback at all in the middle of a run -- the board changes colour and
 * whether that was progress is invisible.
 */
export function FloodIt({ difficulty }: MinigameBoardProps) {
  const { size, colors } = RULES_FLOOD[difficulty];

  const [board, setBoard] = useState<number[]>(() => createFlood(size, colors));
  const [moves, setMoves] = useState(0);

  const hasWon = useMemo(() => isFlooded(board), [board]);
  const owned = useMemo(() => floodedCount(board, size), [board, size]);
  const isRecord = useRecordRun(scoreKey("floodit", difficulty), hasWon, moves);

  const paint = (color: number) => {
    // Picking the colour you already are changes nothing, and counting it would
    // be charging a move for a misclick.
    if (hasWon || color === board[0]) {
      return;
    }
    setBoard(floodFill(board, size, color));
    setMoves((value) => value + 1);
  };

  const reset = () => {
    setBoard(createFlood(size, colors));
    setMoves(0);
  };

  return (
    <GameShell
      columns={size}
      rows={size}
      hud={[
        { label: "Hamle", value: moves },
        {
          label: "Alan",
          value: `${Math.round((owned / (size * size)) * 100)}%`,
          tone: hasWon ? "record" : undefined,
        },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: "Sol üst köşeden başla. Bir renk seç, bağlı olan her kare o renge dönsün.",
        tone: hasWon ? "done" : "idle",
      }}
      aside={
        <div className="ct-flood-palette" aria-label="Renkler">
          {Array.from({ length: colors }, (_, color) => (
            <button
              key={color}
              type="button"
              className="ct-flood-swatch"
              data-color={color}
              data-current={board[0] === color ? "true" : undefined}
              disabled={hasWon || board[0] === color}
              onClick={() => paint(color)}
              aria-label={`${color + 1}. renk`}
            />
          ))}
        </div>
      }
      overlay={
        hasWon ? (
          <GameOutcome
            tone="won"
            title="Tahta tek renk"
            detail={`${moves} hamle`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div
        className="ct-board ct-flood-board"
        aria-label="Renk yayılımı tahtası"
        data-state={hasWon ? "won" : undefined}
      >
        {board.map((color, index) => (
          <div key={index} className="ct-flood-cell" data-color={color} />
        ))}
      </div>
    </GameShell>
  );
}
