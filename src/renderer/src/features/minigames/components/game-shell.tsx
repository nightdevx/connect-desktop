import type { CSSProperties, ReactNode } from "react";

export interface HudMetric {
  label: string;
  value: ReactNode;
  /**
   * "record" is the personal best and wears the accent; "alert" is a number
   * that has gone the wrong way. Everything else is just a number.
   */
  tone?: "record" | "alert";
}

export type StatusTone = "idle" | "you" | "them" | "wait" | "done";

interface GameShellProps {
  /** The board. */
  children: ReactNode;
  /**
   * The board's own dimensions. Everything in the stage sizes itself from
   * these, which is what lets a 30x16 minefield and a 3x3 tic-tac-toe live in
   * the same layout without either being distorted.
   */
  columns: number;
  rows: number;
  /**
   * Free-form, above the HUD. The two-player games put their seats here, and
   * chess adds the line that says what the opponent just played -- neither of
   * which is a label-and-number the HUD could carry.
   */
  header?: ReactNode;
  hud?: readonly HudMetric[];
  /** Buttons, pushed to the far end of the HUD row. */
  actions?: ReactNode;
  status?: { text: ReactNode; tone?: StatusTone };
  /** The column beside the board: chess's scoresheet. */
  aside?: ReactNode;
  /** Drawn over the board once the run is over. */
  overlay?: ReactNode;
}

/**
 * One layout, for every game on the page.
 *
 * It exists because there were five copies of it. Each game opened with the
 * same metric bar, the same centred board and the same muted line underneath,
 * and each had drifted: chess laid itself out 160px wider than the rest, so the
 * whole column jumped whenever the game changed, and the two-player games put
 * their buttons somewhere else entirely.
 *
 * Three things it fixes that no game could fix alone:
 *
 *   SIZE     The board is capped by BOTH its width and its height, and keeps
 *            square cells at whatever shape it is. Before, every board was
 *            forced square at 520px: Connect Four's discs came out as ellipses
 *            on a 7x6 grid, and 2048 pushed the leaderboard off the bottom of
 *            the page to draw four enormous tiles.
 *   ALIGN    The seats, the HUD and the status line are as wide as the BOARD,
 *            not as wide as the panel. Stretched to the panel they read as
 *            unmoored furniture with a board floating somewhere behind them.
 *   ASIDE    The panel is far wider than a board, and all of that was empty
 *            gutter. The column beside the board is where the scoresheet goes,
 *            which is also what stops it being below the fold.
 *
 * The width arithmetic lives on the stage, once, as custom properties -- so
 * every row in it resolves to the same number as the board without any of them
 * measuring anything.
 */
export function GameShell({
  children,
  columns,
  rows,
  header,
  hud,
  actions,
  status,
  aside,
  overlay,
}: GameShellProps) {
  return (
    <div className="ct-arcade">
      <div
        className="ct-arcade-stage"
        style={
          {
            "--board-columns": String(columns),
            "--board-rows": String(rows),
          } as CSSProperties
        }
      >
        {header ? <div className="ct-arcade-header">{header}</div> : null}

        {hud || actions ? (
          <div className="ct-arcade-hud">
            {hud?.map((metric) => (
              <span key={metric.label} className="ct-arcade-metric" data-tone={metric.tone}>
                <span className="ct-arcade-metric-label">{metric.label}</span>
                <strong className="ct-arcade-metric-value">{metric.value}</strong>
              </span>
            ))}
            {actions ? <span className="ct-arcade-actions">{actions}</span> : null}
          </div>
        ) : null}

        <div className="ct-arcade-frame">
          {children}
          {overlay}
        </div>

        {status ? (
          <p
            className="ct-arcade-status"
            data-tone={status.tone ?? "idle"}
            role="status"
            aria-live="polite"
          >
            {status.text}
          </p>
        ) : null}
      </div>

      {aside ? <aside className="ct-arcade-aside">{aside}</aside> : null}
    </div>
  );
}
