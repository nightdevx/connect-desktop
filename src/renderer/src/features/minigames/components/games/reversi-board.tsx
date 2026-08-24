import type { VersusViewProps } from "../../versus-view";

/**
 * Reversi.
 *
 * The legal cells arrive in the table. This highlights from that list and works
 * nothing out for itself -- a second implementation of "does this flip
 * anything" is a second thing to get wrong, and the wrong one is the one under
 * the cursor.
 */
export function ReversiBoard({ table, isMyTurn, isBusy, onCell }: VersusViewProps) {
  const board = table.reversi;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-board ct-reversi-board" aria-label="Reversi tahtası">
      {board.cells.map((owner, index) => {
        const isPlayable = isMyTurn && board.legalMoves.includes(index);

        return (
          <button
            key={index}
            type="button"
            className="ct-reversi-cell"
            data-playable={isPlayable ? "true" : undefined}
            data-last={board.lastCell === index ? "true" : undefined}
            disabled={!isPlayable || isBusy}
            onClick={() => onCell(index)}
            aria-label={`${(index % board.size) + 1}. sütun ${Math.floor(index / board.size) + 1}. sıra`}
          >
            {owner === -1 ? null : (
              <span
                // Keyed on the owner so a disc that CHANGES hands remounts,
                // which is what replays the flip. Keyed on the index alone it
                // would be the same node with a new colour, and the animation
                // would never run.
                key={owner}
                className="ct-reversi-disc"
                data-owner={owner}
                data-flipped={board.flipped.includes(index) ? "true" : undefined}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The two disc counts, which is also the score. */
export function ReversiAside({ table }: VersusViewProps) {
  const board = table.reversi;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Taşlar</span>
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
      {board.passed ? (
        <p className="ct-versus-panel-note">
          Rakibin oynayacak hamlesi yoktu, sıra sana geri geldi.
        </p>
      ) : null}
    </div>
  );
}
