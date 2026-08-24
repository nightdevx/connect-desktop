import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/**
 * Yahtzee, two to four.
 *
 * The cup and the sheet are two halves of one turn, so the cup is the board and
 * the sheet is the column beside it -- reading what is left to fill in while
 * deciding what to keep is the entire game, and putting the sheet below the
 * fold would have hidden the decision.
 *
 * Every number in the sheet arrives from the server, including the previews of
 * what each box WOULD score. A small straight is a rule, and a second opinion
 * about it here would offer a number the server refuses to write.
 */
export function YahtzeeBoard({ table, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.yahtzee;
  if (!board) {
    return null;
  }

  const hasRolled = board.rollsLeft < 3;

  const toggleHold = (index: number) => {
    if (!isMyTurn || !hasRolled) {
      return;
    }
    // The whole set is sent, not the one that changed: the server keeps no
    // memory of a half-applied toggle, and "these are the dice I am keeping" is
    // a statement that cannot be applied twice by accident.
    const kept = board.held
      .map((held, position) => (position === index ? !held : held))
      .map((held, position) => (held ? position : -1))
      .filter((position) => position >= 0);

    onMove(`hold:${kept.join(",")}`);
  };

  return (
    <div className="ct-yahtzee">
      <div className="ct-board ct-yahtzee-cup" aria-label="Zarlar">
        {board.dice.map((face, index) => (
          <button
            key={index}
            type="button"
            className="ct-yahtzee-die"
            data-held={board.held[index] ? "true" : undefined}
            data-empty={face === 0 ? "true" : undefined}
            disabled={!isMyTurn || !hasRolled || isBusy}
            onClick={() => toggleHold(index)}
            aria-label={face === 0 ? "Boş zar" : `${face}${board.held[index] ? ", tutuluyor" : ""}`}
          >
            {face === 0 ? "" : DIE_FACES[face]}
          </button>
        ))}
      </div>

      <div className="ct-yahtzee-actions">
        <Button
          type="primary"
          disabled={!isMyTurn || board.rollsLeft <= 0 || isBusy}
          onClick={() => onMove("roll")}
        >
          Zar at ({board.rollsLeft})
        </Button>
        <span className="ct-yahtzee-hint">
          {!isMyTurn
            ? "Sıra rakipte."
            : board.rollsLeft === 3
              ? "Üç atış hakkın var."
              : "Tutmak istediğin zarlara tıkla, sonra tekrar at — ya da bir kutuya yaz."}
        </span>
      </div>
    </div>
  );
}

/** The scoresheet: everybody's, side by side, because that is the race. */
export function YahtzeeAside({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.yahtzee;
  if (!board) {
    return null;
  }

  const hasRolled = board.rollsLeft < 3;

  return (
    <div className="ct-versus-panel ct-yahtzee-sheet">
      <span className="ct-versus-panel-title">Puan kağıdı</span>

      <table className="ct-yahtzee-table">
        <thead>
          <tr>
            <th scope="col">Kutu</th>
            {table.players.map((player, seat) => (
              <th key={player.userId} scope="col" data-me={seat === mySeat ? "true" : undefined}>
                {player.username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.categories.map((label, category) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {table.players.map((player, seat) => {
                const written = board.sheets[seat]?.[category] ?? -1;
                const isOpen = seat === mySeat && written === -1;
                const preview = board.preview[category] ?? -1;

                return (
                  <td key={player.userId} data-me={seat === mySeat ? "true" : undefined}>
                    {written >= 0 ? (
                      <span className="ct-yahtzee-written">{written}</span>
                    ) : isOpen && isMyTurn && hasRolled ? (
                      // The preview doubles as the button. A separate "write
                      // here" control per row would be thirteen extra buttons
                      // saying what the number already says.
                      <button
                        type="button"
                        className="ct-yahtzee-write"
                        disabled={isBusy}
                        onClick={() => onMove(`score:${category}`)}
                      >
                        {preview}
                      </button>
                    ) : (
                      <span className="ct-yahtzee-blank">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Üst bonus</th>
            {table.players.map((player, seat) => (
              <td key={player.userId}>
                {board.upper[seat] ?? 0}
                {board.bonus[seat] ? " +35" : ""}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Toplam</th>
            {table.players.map((player, seat) => (
              <td key={player.userId}>
                <strong>{board.totals[seat] ?? 0}</strong>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
