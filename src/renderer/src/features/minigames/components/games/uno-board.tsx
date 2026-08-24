import { useState, type CSSProperties } from "react";
import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";
import type { MinigameUnoCard } from "@shared/minigames";
import { UnoCardArt } from "../card-art";
import { useMinigameCue } from "../../use-minigame-cue";

const COLOR_NAMES: Record<string, string> = {
  r: "Kırmızı",
  y: "Sarı",
  g: "Yeşil",
  b: "Mavi",
};

/**
 * Son Kart, two to four.
 *
 * The other players' hands arrive EMPTY -- the server cuts each snapshot for
 * the account reading it -- so there is nothing here that could leak a card.
 * What everyone does get is the COUNT beside each name, which is the fact the
 * whole game is played on: "Ali has one left" is the most important thing at
 * the table and hiding it would make the game unreadable.
 *
 * A face-down card renders no face at all rather than covering one with CSS.
 * Somebody will open the inspector.
 *
 * Playing a wild opens a colour picker instead of sending straight away,
 * because the colour is part of the move -- a server that had to ask for it
 * afterwards would need a half-played state to sit in.
 */
export function UnoBoard({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.uno;
  const [wildIndex, setWildIndex] = useState<number | null>(null);

  // A card landing on the pile, whoever played it. Watched on the top card
  // rather than on a move result, because a snapshot is all the client is sent.
  useMinigameCue("cardThrow", board ? `${board.top.color}-${board.top.kind}` : "");

  if (!board) {
    return null;
  }

  const hand = mySeat >= 0 ? board.hands[mySeat] ?? [] : [];

  const play = (index: number) => {
    if (hand[index]?.color === "w") {
      setWildIndex(index);
      return;
    }
    onMove(`play:${index}`);
  };

  return (
    <div className="ct-board ct-felt ct-uno-board" aria-label="Son Kart masası">
      {/* Everybody else's hands, fanned face-down around the top of the table.
          Drawn from the counts alone, which is all the client is given. */}
      <div className="ct-uno-opponents">
        {board.counts.map((count, seat) =>
          seat === mySeat ? null : (
            <div key={seat} className="ct-uno-opponent">
              <span className="ct-uno-opponent-name">
                <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
                {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
              </span>
              <span className="ct-uno-fan" data-count={Math.min(count, 12)}>
                {Array.from({ length: Math.min(count, 12) }, (_, index) => (
                  <span
                    key={index}
                    className="ct-uno-mini"
                    style={
                      {
                        "--card-index": String(index),
                        "--card-count": String(Math.min(count, 12)),
                      } as CSSProperties
                    }
                  >
                    <UnoCardArt card={{ color: "w", kind: "wild" }} facedown />
                  </span>
                ))}
              </span>
              <span className="ct-uno-opponent-count" data-alert={count === 1 ? "true" : undefined}>
                {count === 1 ? "SON!" : count}
              </span>
            </div>
          ),
        )}
      </div>

      <div className="ct-uno-table">
        <button
          type="button"
          className="ct-uno-pile"
          disabled={!isMyTurn || board.drawn || isBusy}
          onClick={() => onMove("draw")}
          aria-label={`Deste, ${board.pile} kart`}
        >
          <UnoCardArt card={{ color: "w", kind: "wild" }} facedown />
          <span className="ct-uno-pile-count">{board.pile}</span>
        </button>

        <div className="ct-uno-discard" aria-label="Açık kart">
          {/* Keyed on the card so a new top card MOUNTS, which is what replays
              the throw. Keyed on nothing it is the same node repainted, and the
              animation never runs.
              The angle it lands at is derived from the card itself rather than
              drawn at random: a pile where every card is perfectly square looks
              printed, and one that re-rolls its angle on every re-render twitches
              whenever anything else on the table changes. Same card, same lie. */}
          <span
            key={`${board.top.color}-${board.top.kind}`}
            className="ct-uno-thrown"
            style={{ "--throw-rot": `${lieOf(board.top)}deg` } as CSSProperties}
          >
            <UnoCardArt card={board.top} />
          </span>
          {/* The colour in force and the card on the pile are different things
              after a wild, and only one of them is drawn on the card. */}
          <span className="ct-uno-color" data-color={board.color}>
            {COLOR_NAMES[board.color] ?? "—"}
          </span>
        </div>

        <span className="ct-uno-direction" data-direction={board.direction} aria-hidden="true">
          {board.direction === 1 ? "↻" : "↺"}
        </span>
      </div>

      {mySeat < 0 ? (
        <p className="ct-uno-spectating">
          İzliyorsun — eller gizli, sadece kart sayıları görünüyor.
        </p>
      ) : (
        <>
          {/* The hand is a FAN, not a row: every card is rotated a little about
              a pivot well below the table edge, which is what a held hand does
              and what a row of overlapped rectangles never does. The spread per
              card shrinks as the hand grows, so twenty cards still fit in the
              same arc that five do. Both numbers go to CSS as custom properties
              and the arithmetic happens there -- no layout code here. */}
          <div
            className="ct-uno-hand"
            aria-label="Elin"
            style={{ "--card-count": String(hand.length) } as CSSProperties}
          >
            {hand.map((card, index) => (
              <button
                key={index}
                type="button"
                className="ct-uno-card-button"
                style={{ "--card-index": String(index) } as CSSProperties}
                disabled={!isMyTurn || isBusy}
                onClick={() => play(index)}
              >
                <UnoCardArt card={card} />
              </button>
            ))}
          </div>

          <div className="ct-uno-actions">
            <Button
              disabled={!isMyTurn || board.drawn || isBusy}
              onClick={() => onMove("draw")}
            >
              Kart çek
            </Button>
            <Button
              // Only after drawing: passing without drawing is not a move, and
              // offering it would let somebody skip their turn for free.
              disabled={!isMyTurn || !board.drawn || isBusy}
              onClick={() => onMove("pass")}
            >
              Pas
            </Button>
          </div>
        </>
      )}

      {wildIndex !== null ? (
        <div className="ct-uno-picker" role="dialog" aria-label="Renk seç">
          <span className="ct-uno-picker-title">Rengi seç</span>
          <div className="ct-uno-picker-colors">
            {Object.keys(COLOR_NAMES).map((color) => (
              <button
                key={color}
                type="button"
                className="ct-uno-swatch"
                data-color={color}
                onClick={() => {
                  onMove(`play:${wildIndex}:${color}`);
                  setWildIndex(null);
                }}
                aria-label={COLOR_NAMES[color]}
              />
            ))}
          </div>
          <Button size="small" onClick={() => setWildIndex(null)}>
            Vazgeç
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * How crooked a card lies once it is thrown, in degrees, from the card itself.
 *
 * A deterministic hash rather than Math.random for two reasons: a re-render must
 * not move a card that is already on the table, and the same card must land the
 * same way for everybody at the table -- otherwise two people looking at the
 * same pile are looking at different piles. Range is about -6..6, which is
 * enough to stop the pile looking printed and not enough to hide the face.
 */
function lieOf(card: MinigameUnoCard): number {
  const text = `${card.color}${card.kind}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 13) - 6;
}

/** Card counts, which are public and are the whole tension of the game. */
export function UnoAside({ table }: VersusViewProps) {
  const board = table.uno;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Eller</span>
      <ul className="ct-versus-scorelist">
        {board.counts.map((count, seat) => (
          <li
            key={seat}
            className="ct-versus-scorerow"
            data-alert={count === 1 ? "true" : undefined}
          >
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{count}</strong>
            {count === 1 ? <span className="ct-versus-scorenote">Son kart!</span> : null}
          </li>
        ))}
      </ul>
      <p className="ct-versus-panel-note">
        Aynı renk ya da aynı sayı oynanır. Joker her zaman oynanır ve rengi sen
        seçersin.
      </p>
    </div>
  );
}
