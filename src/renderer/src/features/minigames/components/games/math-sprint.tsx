import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_MATH } from "../../difficulty";
import { buildQuestion, type MathQuestion } from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/**
 * Mental arithmetic against a clock. The score is how many you get right.
 *
 * A wrong answer costs a question rather than ending the run, which is the
 * decision that makes this a sprint instead of a quiz: the fastest strategy is
 * to keep moving, and there is nothing to gain by stopping to be sure.
 *
 * The clock starts on the first answer, for the same reason the typing test's
 * does -- a countdown that starts on mount measures how long it took to look at
 * the screen.
 */
export function MathSprint({ difficulty }: MinigameBoardProps) {
  const { seconds, ceiling, multiply } = RULES_MATH[difficulty];

  const [question, setQuestion] = useState<MathQuestion>(() =>
    buildQuestion(ceiling, multiply),
  );
  const [answer, setAnswer] = useState("");
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  // "hit" or "miss" for a moment after each answer, so the board reacts to
  // being right as well as to being wrong.
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);

  const isOver = running && left <= 0;
  const isRecord = useRecordRun(scoreKey("mathsprint", difficulty), isOver, correct);

  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    if (!running || left <= 0) {
      return;
    }
    const timer = setInterval(() => setLeft((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [running, left]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isOver || answer.trim() === "") {
      return;
    }

    if (!running) {
      setRunning(true);
    }

    const isRight = Number(answer) === question.answer;
    if (isRight) {
      setCorrect((value) => value + 1);
    } else {
      setWrong((value) => value + 1);
    }

    setFlash(isRight ? "hit" : "miss");
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 240);

    setQuestion(buildQuestion(ceiling, multiply));
    setAnswer("");
  };

  const reset = () => {
    setQuestion(buildQuestion(ceiling, multiply));
    setAnswer("");
    setCorrect(0);
    setWrong(0);
    setLeft(seconds);
    setRunning(false);
    setFlash(null);
    inputRef.current?.focus();
  };

  return (
    <GameShell
      columns={10}
      rows={5}
      hud={[
        { label: "Doğru", value: correct },
        { label: "Yanlış", value: wrong, tone: wrong > 0 ? "alert" : undefined },
        {
          label: "Süre",
          value: `${left} sn`,
          tone: running && left <= 10 ? "alert" : undefined,
        },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni tur
        </Button>
      }
      status={{
        text: running
          ? "Yanlış cevap turu bitirmez — sadece bir soru kaybettirir."
          : "İlk cevabınla süre başlar.",
        tone: isOver ? "done" : running ? "you" : "idle",
      }}
      overlay={
        isOver ? (
          <GameOutcome
            tone="won"
            title="Süre doldu"
            detail={`${correct} doğru · ${wrong} yanlış`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <form
        className="ct-board ct-math-board"
        data-flash={flash ?? undefined}
        onSubmit={submit}
      >
        <span className="ct-math-question">{question.text}</span>
        <input
          ref={inputRef}
          className="ct-math-input"
          // "text" with a numeric inputmode rather than type="number": the
          // number input's spinner arrows and scroll-to-change are both ways to
          // ruin an answer that was already typed.
          type="text"
          inputMode="numeric"
          value={answer}
          onChange={(event) => setAnswer(event.target.value.replace(/[^\d-]/g, ""))}
          disabled={isOver}
          autoComplete="off"
          aria-label="Cevap"
        />
        <span className="ct-math-hint">Enter ile gönder</span>
      </form>
    </GameShell>
  );
}
