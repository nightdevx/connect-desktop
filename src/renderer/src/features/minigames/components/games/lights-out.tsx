import { useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_LIGHTS } from "../../difficulty";
import { createLights, isLightsOut, pressLight } from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/**
 * Lights Out. Press a cell, it and its four neighbours flip; turn them all off.
 *
 * The generated board is always solvable, and it has to be: only a quarter of
 * 5x5 light configurations have any solution at all, so a randomly filled grid
 * is a puzzle the player will spend an evening failing to finish for reasons
 * that are not their fault. createLights builds it by pressing a dark board,
 * which makes the sequence of presses that undoes it exist by construction.
 */
export function LightsOut({ difficulty }: MinigameBoardProps) {
  const { size, presses } = RULES_LIGHTS[difficulty];

  const [board, setBoard] = useState<boolean[]>(() => createLights(size, presses));
  const [moves, setMoves] = useState(0);

  const hasWon = useMemo(() => isLightsOut(board), [board]);
  const isRecord = useRecordRun(scoreKey("lightsout", difficulty), hasWon, moves);
  const lit = board.filter(Boolean).length;

  const press = (cell: number) => {
    if (hasWon) {
      return;
    }
    setBoard(pressLight(board, cell, size));
    setMoves((value) => value + 1);
  };

  const reset = () => {
    setBoard(createLights(size, presses));
    setMoves(0);
  };

  return (
    <GameShell
      columns={size}
      rows={size}
      hud={[
        { label: "Basış", value: moves },
        { label: "Açık", value: lit, tone: lit === 0 ? "record" : undefined },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: "Bir kareye bas: kendisi ve dört komşusu yer değiştirir. Hepsini söndür.",
        tone: hasWon ? "done" : "idle",
      }}
      overlay={
        hasWon ? (
          <GameOutcome
            tone="won"
            title="Işıklar söndü"
            detail={`${moves} basış`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div
        className="ct-board ct-lights-board"
        aria-label="Işıklar tahtası"
        data-state={hasWon ? "won" : undefined}
      >
        {board.map((isLit, index) => (
          <button
            key={index}
            type="button"
            className="ct-lights-cell"
            data-lit={isLit ? "true" : undefined}
            onClick={() => press(index)}
            aria-label={`${(index % size) + 1}. sütun ${Math.floor(index / size) + 1}. sıra, ${isLit ? "açık" : "kapalı"}`}
          />
        ))}
      </div>
    </GameShell>
  );
}
