import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";

/**
 * Bilgi yarışması, two to four.
 *
 * The right answer is not in the table until it has been given -- it lives in
 * an unexported field on the server and is simply not serialised -- so there is
 * nothing here to hide and nothing to accidentally render. `correct` is -1
 * until `reveal`, and that is the whole of the mechanism.
 *
 * Everybody sees the same board, including the people whose turn it is not:
 * that is the point of taking it in turns rather than answering at once. The
 * table gets to shout the answer at whoever is playing.
 */
export function QuizBoard({ table, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.quiz;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-board ct-quiz-board" aria-label="Soru">
      <span className="ct-quiz-counter">
        {board.asked}/{board.total}
      </span>

      <p className="ct-quiz-question">{board.question}</p>

      <div className="ct-quiz-options">
        {board.options.map((option, index) => (
          <button
            key={index}
            type="button"
            className="ct-quiz-option"
            data-state={
              !board.reveal
                ? undefined
                : index === board.correct
                  ? "right"
                  : index === board.chosen
                    ? "wrong"
                    : undefined
            }
            data-chosen={board.chosen === index ? "true" : undefined}
            disabled={!isMyTurn || board.reveal || isBusy}
            onClick={() => onMove(`answer:${index}`)}
          >
            <span className="ct-quiz-letter">{"ABCD"[index]}</span>
            {option}
          </button>
        ))}
      </div>

      {board.reveal ? (
        <Button
          type="primary"
          // Only the person who answered advances it. Anybody else pressing it
          // would take the reveal off the screen before the table had read it.
          disabled={!isMyTurn || isBusy}
          onClick={() => onMove("next")}
        >
          {board.asked >= board.total ? "Bitir" : "Devam"}
        </Button>
      ) : null}
    </div>
  );
}

export function QuizAside({ table }: VersusViewProps) {
  const board = table.quiz;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Skor</span>
      <ul className="ct-versus-scorelist">
        {board.scores.map((score, seat) => (
          <li key={seat} className="ct-versus-scorerow">
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{score}</strong>
          </li>
        ))}
      </ul>
      <p className="ct-versus-panel-note">
        Herkes sırayla kendi sorusunu cevaplar. Toplam {board.total} soru.
      </p>
    </div>
  );
}
