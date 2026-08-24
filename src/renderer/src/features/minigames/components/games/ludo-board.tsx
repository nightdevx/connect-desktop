import { useMemo } from "react";
import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const GRID = 15;
const LOOP = 52;
const QUARTER = 13;
const HOME_STEPS = 5;
const IN_BASE = -1;
const HOME = 56;

/**
 * Kızma Birader.
 *
 * The whole 15x15 board is GENERATED from one arm of thirteen squares, turned
 * three times. A quarter turn about the centre is (x, y) -> (14 - y, x), and
 * every other coordinate on the board -- the other three arms, the four home
 * columns, the four bases -- is that same rotation applied to the first one.
 *
 * Written out as four tables instead, it is 52 + 20 + 16 coordinates by hand,
 * and a board where one square of one arm is a pixel out is a board where a
 * token teleports on exactly one move.
 *
 * The server sends step counts. This turns a step count into a square, and that
 * is the only arithmetic here -- whether a token MAY move is in `moves`, which
 * arrives with the board.
 */
export function LudoBoard({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.ludo;

  const layout = useMemo(() => buildLayout(), []);

  if (!board) {
    return null;
  }

  // Where every token is, as a grid cell. Built once per frame rather than
  // searched per square: 15x15 squares looking for a token each would be 225
  // scans of a four-token list.
  const tokensAt = new Map<number, { seat: number; token: number }[]>();
  board.tokens.forEach((tokens, seat) => {
    const quarter = Math.floor(board.entries[seat] / QUARTER);
    tokens.forEach((steps, token) => {
      const cell = squareOf(layout, quarter, steps, token);
      if (cell === null) {
        return;
      }
      const list = tokensAt.get(cell) ?? [];
      list.push({ seat, token });
      tokensAt.set(cell, list);
    });
  });

  const myQuarter =
    mySeat >= 0 && board.entries[mySeat] !== undefined
      ? Math.floor(board.entries[mySeat] / QUARTER)
      : -1;

  return (
    <div className="ct-ludo">
      <div className="ct-board ct-ludo-board" aria-label="Kızma birader tahtası">
        {Array.from({ length: GRID * GRID }, (_, cell) => {
          const role = layout.roles.get(cell);
          const here = tokensAt.get(cell) ?? [];

          return (
            <div
              key={cell}
              className="ct-ludo-cell"
              data-role={role?.kind}
              data-seat={role?.quarter}
              data-safe={layout.safe.has(cell) ? "true" : undefined}
            >
              {here.map(({ seat, token }, position) => {
                const movable =
                  isMyTurn && seat === mySeat && board.moves.includes(token);

                return (
                  <button
                    key={`${seat}-${token}`}
                    type="button"
                    className="ct-ludo-token"
                    data-owner={seat}
                    data-movable={movable ? "true" : undefined}
                    // Stacked tokens fan out slightly, so four in a base read as
                    // four rather than as one.
                    data-stack={here.length > 1 ? position : undefined}
                    disabled={!movable || isBusy}
                    onClick={() => onMove(`move:${token}`)}
                    aria-label={`${table.players[seat]?.username ?? seat + 1} — ${token + 1}. pul`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="ct-ludo-actions">
        <span className="ct-ludo-die" data-rolled={board.rolled ? "true" : undefined}>
          {board.dice === 0 ? "—" : DIE_FACES[board.dice]}
        </span>
        <Button
          type="primary"
          disabled={!isMyTurn || board.rolled || isBusy}
          onClick={() => onMove("roll")}
        >
          Zar at
        </Button>
        <span className="ct-ludo-hint">
          {!isMyTurn
            ? "Sıra rakipte."
            : !board.rolled
              ? "Zar at. Bazadan çıkmak için 6 gerekir."
              : board.moves.length === 0
                ? "Oynanacak hamle yok."
                : "Oynatmak istediğin pula tıkla."}
          {myQuarter >= 0 ? "" : " İzliyorsun."}
        </span>
      </div>
    </div>
  );
}

/** Tokens home, per seat, plus what the last move did. */
export function LudoAside({ table }: VersusViewProps) {
  const board = table.ludo;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Eve gelen</span>
      <ul className="ct-versus-scorelist">
        {board.home.map((home, seat) => (
          <li key={seat} className="ct-versus-scorerow">
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{home}/4</strong>
          </li>
        ))}
      </ul>
      {board.lastEvent === "capture" ? (
        <p className="ct-versus-panel-note">Bir pul kırıldı ve bazaya döndü.</p>
      ) : null}
      {board.lastEvent === "home" ? (
        <p className="ct-versus-panel-note">Bir pul eve girdi.</p>
      ) : null}
      <p className="ct-versus-panel-note">
        Yıldızlı kareler güvenli — orada duran pul kırılmaz. Eve tam sayıyla
        girilir.
      </p>
    </div>
  );
}

interface Layout {
  /** The 52 loop squares, in order, as grid cells. */
  track: number[];
  /** homes[quarter][0..4]: that player's own final five squares. */
  homes: number[][];
  /** bases[quarter][0..3]: where a token in the base sits. */
  bases: number[][];
  /** The centre square, which is home for everybody. */
  centre: number;
  /** What each grid cell IS, for painting. */
  roles: Map<number, { kind: string; quarter?: number }>;
  safe: Set<number>;
}

/**
 * The whole board, from one arm and three rotations.
 *
 * The first arm is written out because something has to be; everything else is
 * derived, so the four quarters cannot disagree.
 */
function buildLayout(): Layout {
  const turn = ({ x, y }: { x: number; y: number }) => ({ x: GRID - 1 - y, y: x });
  const cellOf = ({ x, y }: { x: number; y: number }) => y * GRID + x;

  // Thirteen squares: along the left arm, up its side, over the top corner.
  let arm = [
    { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
    { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 6, y: 1 },
    { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 },
  ];
  let home = Array.from({ length: HOME_STEPS }, (_, step) => ({ x: step + 1, y: 7 }));
  let base = [
    { x: 1, y: 1 }, { x: 4, y: 1 }, { x: 1, y: 4 }, { x: 4, y: 4 },
  ];

  const track: number[] = [];
  const homes: number[][] = [];
  const bases: number[][] = [];
  const roles = new Map<number, { kind: string; quarter?: number }>();
  const safe = new Set<number>();

  for (let quarter = 0; quarter < 4; quarter++) {
    arm.forEach((point, index) => {
      const cell = cellOf(point);
      track.push(cell);
      roles.set(cell, {
        kind: index === 0 ? "entry" : "track",
        // Only the entry square is tinted: tinting the whole arm makes the loop
        // look like four separate tracks, which is exactly what it is not.
        quarter: index === 0 ? quarter : undefined,
      });
      // The entry square and the star eight past it, matching the server's own
      // safe list.
      if (index === 0 || index === 8) {
        safe.add(cell);
      }
    });

    homes.push(home.map(cellOf));
    home.forEach((point) => roles.set(cellOf(point), { kind: "home", quarter }));

    bases.push(base.map(cellOf));
    base.forEach((point) => roles.set(cellOf(point), { kind: "base", quarter }));

    arm = arm.map(turn);
    home = home.map(turn);
    base = base.map(turn);
  }

  const centre = cellOf({ x: 7, y: 7 });
  roles.set(centre, { kind: "centre" });

  return { track, homes, bases, centre, roles, safe };
}

/**
 * Which grid cell a token sits on, from its step count. null when it is not
 * anywhere drawable, which cannot happen but is cheaper than trusting it.
 */
function squareOf(
  layout: Layout,
  quarter: number,
  steps: number,
  token: number,
): number | null {
  if (steps === IN_BASE) {
    return layout.bases[quarter]?.[token] ?? null;
  }
  if (steps >= HOME) {
    return layout.centre;
  }
  if (steps > LOOP - 2) {
    return layout.homes[quarter]?.[steps - (LOOP - 1)] ?? null;
  }
  return layout.track[(quarter * QUARTER + steps) % LOOP] ?? null;
}
