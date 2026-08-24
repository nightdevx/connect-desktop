import { useEffect, useState } from "react";
import { Button, Slider } from "antd";
import type { VersusViewProps } from "../../versus-view";
import { ChipStack, PlayingCard } from "../card-art";

const STAGE_LABELS: Record<string, string> = {
  preflop: "Kapalı",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Açılış",
};

const ACTION_LABELS: Record<string, string> = {
  fold: "Pas",
  check: "Bekle",
  call: "Gör",
  raise: "Yükselt",
  allin: "All-in",
};

/**
 * Texas Hold'em with play chips, two to four.
 *
 * The action buttons come from the server: `actions` is what this seat may
 * legally do right now, and drawing anything else would offer a button the
 * server refuses. Whether a check is available depends on the bet in front of
 * you, and that is a rule.
 *
 * Nobody's hole cards are here except the viewer's -- and, at a showdown,
 * whoever is still in the hand, because that is what a showdown IS. A folded or
 * hidden hand renders as backs with no face in the DOM at all.
 */
export function PokerBoard({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.poker;
  const [raiseTo, setRaiseTo] = useState(0);

  // Re-armed whenever the minimum moves, so the slider never sits below a raise
  // the server would refuse.
  useEffect(() => {
    setRaiseTo(board?.raiseTo ?? 0);
  }, [board?.raiseTo, board?.stage]);

  if (!board) {
    return null;
  }

  const myChips = mySeat >= 0 ? board.chips[mySeat] ?? 0 : 0;
  const myBet = mySeat >= 0 ? board.bets[mySeat] ?? 0 : 0;
  const maxRaise = myChips + myBet;

  return (
    <div className="ct-board ct-felt ct-poker-board" aria-label="Poker masası">
      <div className="ct-poker-seats">
        {table.players.map((player, seat) => {
          const folded = board.folded[seat];
          const shown = board.revealed[seat] || seat === mySeat;
          const cards = board.hands[seat] ?? [];

          return (
            <div
              key={player.userId}
              className="ct-poker-seat"
              data-me={seat === mySeat ? "true" : undefined}
              data-turn={table.turn === seat ? "true" : undefined}
              data-folded={folded ? "true" : undefined}
              data-allin={board.allIn[seat] ? "true" : undefined}
            >
              <span className="ct-poker-hand">
                {/* Two cards always drawn, so a seat does not change size when
                    its hand is hidden. Backs when they may not be read. */}
                {shown && cards.length > 0
                  ? cards.map((card, index) => (
                      <PlayingCard
                        key={index}
                        card={card}
                        muted={folded}
                        className="ct-poker-hole"
                      />
                    ))
                  : [0, 1].map((index) => (
                      <PlayingCard
                        key={index}
                        card={{ rank: 0, suit: "s" }}
                        facedown
                        className="ct-poker-hole"
                      />
                    ))}
              </span>

              <span className="ct-poker-name">
                {player.username}
                {seat === board.dealer ? (
                  <span className="ct-poker-button" aria-label="Buton">
                    D
                  </span>
                ) : null}
              </span>

              <ChipStack amount={board.chips[seat] ?? 0} limit={5} />

              {board.bets[seat] > 0 ? (
                <span className="ct-poker-bet">
                  <ChipStack amount={board.bets[seat]} limit={4} />
                </span>
              ) : null}

              {board.results[seat] ? (
                <span className="ct-poker-result">{board.results[seat]}</span>
              ) : folded ? (
                <span className="ct-poker-result">pas</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="ct-poker-centre">
        <span className="ct-poker-stage">{STAGE_LABELS[board.stage] ?? board.stage}</span>

        <div className="ct-poker-community" aria-label="Ortak kartlar">
          {/* Five slots, always. The empty ones are outlines rather than nothing,
              so the board does not jump as the flop, turn and river arrive. */}
          {Array.from({ length: 5 }, (_, index) => {
            const card = board.community[index];
            return card ? (
              <PlayingCard key={index} card={card} className="ct-poker-community-card" />
            ) : (
              <span key={index} className="ct-poker-slot" aria-hidden="true" />
            );
          })}
        </div>

        <span className="ct-poker-pot">
          <span className="ct-poker-pot-label">Pot</span>
          <ChipStack amount={board.pot} limit={6} />
        </span>
      </div>

      {mySeat < 0 ? (
        <p className="ct-poker-spectating">İzliyorsun — eller kapalı.</p>
      ) : (
        <div className="ct-poker-actions">
          {board.actions.map((action) => {
            if (action === "raise") {
              return null;
            }
            return (
              <Button
                key={action}
                type={action === "call" || action === "check" ? "primary" : "default"}
                danger={action === "fold" || action === "allin"}
                disabled={!isMyTurn || isBusy}
                onClick={() => onMove(action)}
              >
                {ACTION_LABELS[action] ?? action}
                {action === "call" ? ` ${board.toCall - myBet}` : ""}
              </Button>
            );
          })}

          {board.actions.includes("raise") ? (
            <span className="ct-poker-raise">
              <Slider
                className="ct-poker-slider"
                min={board.raiseTo}
                max={maxRaise}
                value={Math.min(Math.max(raiseTo, board.raiseTo), maxRaise)}
                onChange={setRaiseTo}
                disabled={!isMyTurn || isBusy}
                tooltip={{ open: false }}
              />
              <Button
                disabled={!isMyTurn || isBusy}
                onClick={() =>
                  onMove(`raise:${Math.min(Math.max(raiseTo, board.raiseTo), maxRaise)}`)
                }
              >
                Yükselt {Math.min(Math.max(raiseTo, board.raiseTo), maxRaise)}
              </Button>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Stacks, and what the last action was. */
export function PokerAside({ table }: VersusViewProps) {
  const board = table.poker;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Çipler</span>
      <ul className="ct-versus-scorelist">
        {board.chips.map((chips, seat) => (
          <li
            key={seat}
            className="ct-versus-scorerow"
            data-out={chips === 0 ? "true" : undefined}
          >
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{chips}</strong>
            {board.allIn[seat] ? (
              <span className="ct-versus-scorenote">all-in</span>
            ) : chips === 0 ? (
              <span className="ct-versus-scorenote">bitti</span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="ct-versus-panel-note">
        Oyun paraları — gerçek para yok, masa kapanınca sıfırlanır. Küçük kör 10,
        büyük kör 20.
      </p>
      <p className="ct-versus-panel-note">
        All-in giden bir oyuncu ancak ödediği kadarını kazanır; üstü yan pot olur
        ve kalanlar arasında bölüşülür.
      </p>
    </div>
  );
}
