import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_SIMON } from "../../difficulty";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

type Phase = "idle" | "showing" | "waiting" | "dead";

/**
 * Simon: watch the sequence, repeat it, it gets one longer.
 *
 * The playback is a chain of timeouts rather than an interval, because each
 * flash is two states -- lit, then dark -- and an interval that toggles between
 * them drifts out of step with itself the moment a render is slow. Every timer
 * is held in a ref and cleared on unmount, so leaving the page mid-sequence
 * cannot light a pad on a board that no longer exists.
 */
export function Simon({ difficulty }: MinigameBoardProps) {
  const { pads, flashMs } = RULES_SIMON[difficulty];

  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // The level is the length of the sequence you have already repeated, so it is
  // derived and never stored: a stored one is a number to forget to reset.
  const level = Math.max(0, sequence.length - (phase === "dead" ? 1 : 0));
  const isRecord = useRecordRun(scoreKey("simon", difficulty), phase === "dead", level);

  const playBack = useCallback(
    (order: readonly number[]) => {
      clearTimers();
      setPhase("showing");
      setStep(0);

      order.forEach((pad, index) => {
        // Two timers per pad: one to light it, one to put it out. The gap
        // between them is what makes two of the same colour in a row readable
        // as two rather than as one long flash.
        timers.current.push(
          setTimeout(() => setActive(pad), index * flashMs * 2),
          setTimeout(() => setActive(null), index * flashMs * 2 + flashMs),
        );
      });

      timers.current.push(
        setTimeout(() => setPhase("waiting"), order.length * flashMs * 2),
      );
    },
    [clearTimers, flashMs],
  );

  const extend = useCallback(
    (current: readonly number[]) => {
      const next = [...current, Math.floor(Math.random() * pads) % pads];
      setSequence(next);
      playBack(next);
    },
    [pads, playBack],
  );

  const start = () => {
    setSequence([]);
    setStep(0);
    extend([]);
  };

  const press = (pad: number) => {
    if (phase !== "waiting") {
      return;
    }

    // Flash what was pressed, so the board answers the click even when the
    // click was wrong.
    setActive(pad);
    timers.current.push(setTimeout(() => setActive(null), 160));

    if (sequence[step] !== pad) {
      setPhase("dead");
      return;
    }

    const next = step + 1;
    if (next < sequence.length) {
      setStep(next);
      return;
    }

    // Repeated the whole thing: one longer, after a beat so the last press is
    // visibly over before the new sequence starts.
    setStep(0);
    timers.current.push(setTimeout(() => extend(sequence), 520));
  };

  const reset = () => {
    clearTimers();
    setSequence([]);
    setStep(0);
    setActive(null);
    setPhase("idle");
  };

  const statusText =
    phase === "idle"
      ? "Başlat'a bas, diziyi izle, sonra aynısını tekrarla."
      : phase === "showing"
        ? "İzle…"
        : phase === "waiting"
          ? `Sıra sende — ${step}/${sequence.length}`
          : "Dizi bozuldu.";

  return (
    <GameShell
      columns={pads === 4 ? 2 : 3}
      rows={2}
      hud={[
        { label: "Seviye", value: level },
        { label: "Uzunluk", value: sequence.length },
      ]}
      actions={
        phase === "idle" ? (
          <Button size="small" type="primary" onClick={start}>
            Başlat
          </Button>
        ) : (
          <Button size="small" onClick={reset}>
            Yeni oyun
          </Button>
        )
      }
      status={{
        text: statusText,
        tone:
          phase === "dead"
            ? "done"
            : phase === "waiting"
              ? "you"
              : phase === "showing"
                ? "them"
                : "idle",
      }}
      overlay={
        phase === "dead" ? (
          <GameOutcome
            tone="lost"
            title="Yanlış renk"
            detail={`${level}. seviye`}
            isRecord={isRecord}
            onRestart={start}
          />
        ) : null
      }
    >
      <div
        className="ct-board ct-simon-board"
        data-pads={pads}
        aria-label="Simon tahtası"
      >
        {Array.from({ length: pads }, (_, pad) => (
          <button
            key={pad}
            type="button"
            className="ct-simon-pad"
            data-pad={pad}
            data-active={active === pad ? "true" : undefined}
            // Disabled while the sequence is playing, so a fast clicker cannot
            // answer a question that has not finished being asked.
            disabled={phase !== "waiting"}
            onClick={() => press(pad)}
            aria-label={`${pad + 1}. renk`}
          />
        ))}
      </div>
    </GameShell>
  );
}
