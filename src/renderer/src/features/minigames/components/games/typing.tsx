import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_TYPING } from "../../difficulty";
import { buildPassage, typingAccuracy, wordsPerMinute } from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

/**
 * A typing test. The record is words per minute over the whole passage.
 *
 * The clock starts on the FIRST KEYSTROKE, not when the board mounts. Starting
 * it on mount measures how long somebody took to notice the page, and the first
 * run after switching games would always be the worst one.
 *
 * There is no backspace-blocking and no forced correctness: a wrong letter is
 * marked wrong, stays wrong, and drags the accuracy down. Refusing the
 * keystroke instead turns a typing test into a game about the enter key.
 */
export function Typing({ difficulty }: MinigameBoardProps) {
  const { words } = RULES_TYPING[difficulty];

  const [passage, setPassage] = useState<string[]>(() => buildPassage(words));
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const target = useMemo(() => passage.join(" "), [passage]);
  const isDone = typed.length >= target.length;

  const wpm = wordsPerMinute(typed.length, elapsed);
  const accuracy = typingAccuracy(typed, target);
  const isRecord = useRecordRun(scoreKey("typing", difficulty), isDone, wpm);

  const inputRef = useRef<HTMLInputElement>(null);

  // A hidden field is what actually receives the keystrokes, so the browser's
  // own text editing -- backspace, ctrl+backspace, IME, paste -- works instead
  // of being reimplemented on top of a keydown listener.
  useEffect(() => {
    inputRef.current?.focus();
  }, [passage]);

  useEffect(() => {
    if (startedAt === null || isDone) {
      return;
    }
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(timer);
  }, [startedAt, isDone]);

  const handleChange = (value: string) => {
    if (isDone) {
      return;
    }
    if (startedAt === null && value.length > 0) {
      setStartedAt(Date.now());
    }
    // Never longer than the passage: the run ends on the last character, and
    // letting it overrun would keep the clock going past the finish line.
    setTyped(value.slice(0, target.length));
    if (startedAt !== null) {
      setElapsed(Date.now() - startedAt);
    }
  };

  const reset = () => {
    setPassage(buildPassage(words));
    setTyped("");
    setStartedAt(null);
    setElapsed(0);
    inputRef.current?.focus();
  };

  return (
    <GameShell
      // The passage is text rather than a grid, so the shell is given a wide
      // shallow box to lay it out in instead of a board shape.
      columns={16}
      rows={6}
      hud={[
        { label: "WPM", value: wpm },
        {
          label: "Doğruluk",
          value: `${accuracy}%`,
          tone: accuracy < 90 ? "alert" : undefined,
        },
        { label: "Süre", value: `${(elapsed / 1000).toFixed(1)} sn` },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni metin
        </Button>
      }
      status={{
        text:
          startedAt === null
            ? "Yazmaya başla — süre ilk tuşla başlar."
            : "Yanlış harf kırmızı kalır, silip düzeltebilirsin.",
        tone: isDone ? "done" : startedAt === null ? "idle" : "you",
      }}
      overlay={
        isDone ? (
          <GameOutcome
            tone="won"
            title="Metin bitti"
            detail={`${wpm} WPM · %${accuracy} doğruluk`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      {/* Clicking anywhere on the passage puts the caret back where it belongs,
          because the field the caret is actually in is invisible. */}
      <div
        className="ct-board ct-typing-board"
        onClick={() => inputRef.current?.focus()}
        aria-label="Yazma metni"
      >
        <p className="ct-typing-passage">
          {target.split("").map((character, index) => (
            <span
              key={index}
              className="ct-typing-char"
              data-state={
                index >= typed.length
                  ? undefined
                  : typed[index] === character
                    ? "hit"
                    : "miss"
              }
              data-caret={index === typed.length ? "true" : undefined}
            >
              {/* A space with nothing in it has no width to colour, so a missed
                  space would be invisible. */}
              {character === " " ? " " : character}
            </span>
          ))}
        </p>

        <input
          ref={inputRef}
          className="ct-typing-input"
          value={typed}
          onChange={(event) => handleChange(event.target.value)}
          // Every one of these is off on purpose: a typing test that
          // autocorrects is measuring the browser.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Yazdığın metin"
        />
      </div>
    </GameShell>
  );
}
