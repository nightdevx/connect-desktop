import { useEffect, useState } from "react";
import { Button } from "antd";
import type { MinigameRummyTile } from "@shared/minigames";
import type { VersusViewProps } from "../../versus-view";
import { useMinigameCue } from "../../use-minigame-cue";
import { OkeyTile } from "../card-art";

/**
 * Okey, and the same engine played to a cumulative penalty ("101").
 *
 * The rack is the whole interface. Real okey is played on a wooden istaka with
 * two rows, and the game is almost entirely about ARRANGING tiles on it -- so
 * the rack here is draggable, the order is local, and none of it is ever sent.
 * The server has no opinion about where a tile sits on your rack, and giving it
 * one would mean a round trip every time somebody tidied their hand.
 *
 * That local order is also why the discard sends the tile's index in the
 * SERVER's hand and not in the displayed one: the two differ the moment
 * anything is dragged, and sending the visible index would discard the wrong
 * tile in exactly the situation the player was concentrating hardest.
 */
export function RummyBoard({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.rummy;

  /** The rack order, as indices into the server's hand. Local, never sent. */
  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const handSize = board && mySeat >= 0 ? board.hands[mySeat]?.length ?? 0 : 0;

  // The rack is re-seeded whenever the hand changes size -- a draw, a discard,
  // a new deal. Anything the player rearranged survives, because the existing
  // order is kept and only the new indices are appended.
  useEffect(() => {
    setOrder((current) => {
      const kept = current.filter((index) => index < handSize);
      const missing = Array.from({ length: handSize }, (_, index) => index).filter(
        (index) => !kept.includes(index),
      );
      return [...kept, ...missing];
    });
  }, [handSize]);

  // A tile put down, by anybody. Counted off the public piles rather than off
  // your own hand: a hand only changes on YOUR turn, and a rack that is silent
  // while three other people play is a rack in an empty room.
  useMinigameCue(
    "tileClack",
    board
      ? board.pile * 1000 + board.discards.reduce((total, pile) => total + pile.length, 0)
      : 0,
  );

  if (!board) {
    return null;
  }

  const hand = mySeat >= 0 ? board.hands[mySeat] ?? [] : [];
  const previous = previousSeat(board.out, mySeat);
  const takeable = previous >= 0 ? board.discards[previous]?.at(-1) : undefined;

  const drop = (target: number) => {
    if (dragging === null || dragging === target) {
      setDragging(null);
      return;
    }
    setOrder((current) => {
      const next = current.filter((index) => index !== dragging);
      next.splice(current.indexOf(target), 0, dragging);
      return next;
    });
    setDragging(null);
  };

  return (
    <div className="ct-board ct-felt ct-rummy-board" aria-label="Okey masası">
      {/* The middle of the table: the indicator, the pile, and everybody's
          discards. All of it public. */}
      <div className="ct-rummy-centre">
        <div className="ct-rummy-slot">
          <span className="ct-rummy-slot-label">Gösterge</span>
          <OkeyTile tile={board.indicator} />
        </div>

        <button
          type="button"
          className="ct-rummy-slot ct-rummy-pile"
          disabled={!isMyTurn || board.drawn || isBusy}
          onClick={() => onMove("draw")}
        >
          <span className="ct-rummy-slot-label">Deste</span>
          <OkeyTile tile={{ color: "", value: 0 }} facedown />
          <span className="ct-rummy-pile-count">{board.pile}</span>
        </button>

        <div className="ct-rummy-slot">
          <span className="ct-rummy-slot-label">Okey</span>
          <OkeyTile tile={board.okey} isOkey />
        </div>
      </div>

      <div className="ct-rummy-discards">
        {board.discards.map((pile, seat) => {
          const top = pile.at(-1);
          const isSource = seat === previous;

          return (
            <button
              key={seat}
              type="button"
              className="ct-rummy-discard"
              data-seat={seat}
              data-source={isSource ? "true" : undefined}
              disabled={!isMyTurn || board.drawn || isBusy || !isSource || !top}
              onClick={() => onMove("take")}
              aria-label={`${table.players[seat]?.username ?? seat + 1} ıskartası`}
            >
              <span className="ct-rummy-discard-name">
                <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
                {table.players[seat]?.username ?? `${seat + 1}.`}
                {board.out[seat] ? " (elendi)" : ""}
              </span>
              {top ? (
                <OkeyTile tile={top} isOkey={isSameTile(top, board.okey)} />
              ) : (
                <span className="ct-rummy-empty" aria-hidden="true" />
              )}
              <span className="ct-rummy-discard-count">{pile.length}</span>
            </button>
          );
        })}
      </div>

      {mySeat < 0 ? (
        <p className="ct-rummy-spectating">
          İzliyorsun — ıstakalar gizli, sadece taş sayıları görünüyor.
        </p>
      ) : (
        <>
          {/* The rack. Two rows, like a real istaka: the top row takes the first
              half of whatever is on it, so a fifteen-tile hand is 8 + 7. */}
          <div className="ct-rummy-rack" aria-label="Istakan">
            {[0, 1].map((row) => (
              <div key={row} className="ct-rummy-rack-row">
                {order
                  .slice(
                    row === 0 ? 0 : Math.ceil(order.length / 2),
                    row === 0 ? Math.ceil(order.length / 2) : undefined,
                  )
                  .map((index) => {
                    const tile = hand[index];
                    if (!tile) {
                      return null;
                    }

                    return (
                      <button
                        key={index}
                        type="button"
                        className="ct-rummy-rack-slot"
                        draggable
                        onDragStart={() => setDragging(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => drop(index)}
                        onDragEnd={() => setDragging(null)}
                        data-dragging={dragging === index ? "true" : undefined}
                        onClick={() => setSelected(selected === index ? null : index)}
                      >
                        <OkeyTile
                          tile={tile}
                          selected={selected === index}
                          isOkey={isSameTile(tile, board.okey)}
                        />
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>

          <div className="ct-rummy-actions">
            <Button
              disabled={!isMyTurn || board.drawn || isBusy}
              onClick={() => onMove("draw")}
            >
              Desteden çek
            </Button>
            <Button
              disabled={!isMyTurn || board.drawn || isBusy || !takeable}
              onClick={() => onMove("take")}
            >
              Iskartadan al
            </Button>
            <Button
              type="primary"
              disabled={!isMyTurn || !board.drawn || isBusy || selected === null}
              onClick={() => {
                if (selected === null) {
                  return;
                }
                onMove(`discard:${selected}`);
                setSelected(null);
              }}
            >
              At
            </Button>
            <Button
              danger
              // A wrong declaration costs nothing but the message -- the server
              // checks the hand BEFORE moving anything -- so this is offered
              // whenever a tile is selected rather than being gated on a guess
              // about whether the hand is finished.
              disabled={!isMyTurn || !board.drawn || isBusy || selected === null}
              onClick={() => {
                if (selected === null) {
                  return;
                }
                onMove(`declare:${selected}`);
                setSelected(null);
              }}
            >
              El aç
            </Button>
          </div>

          <p className="ct-rummy-hint">
            Bir taş seç, sonra At ya da El aç. Istakadaki sırayı sürükleyerek
            değiştirebilirsin — bu sıra sadece sende durur.
          </p>
        </>
      )}
    </div>
  );
}

/** Tile counts, and the running penalty when the table keeps one. */
export function RummyAside({ table }: VersusViewProps) {
  const board = table.rummy;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">
        {board.target > 0 ? `Ceza (${board.target})` : "Istakalar"}
      </span>
      <ul className="ct-versus-scorelist">
        {board.counts.map((count, seat) => (
          <li
            key={seat}
            className="ct-versus-scorerow"
            data-out={board.out[seat] ? "true" : undefined}
          >
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
            </span>
            <strong>{board.target > 0 ? board.penalties[seat] : count}</strong>
            <span className="ct-versus-scorenote">
              {board.out[seat] ? "elendi" : board.target > 0 ? `${count} taş` : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="ct-versus-panel-note">
        Okey <strong>{board.okey.value}</strong> (
        {board.okey.color === "r"
          ? "kırmızı"
          : board.okey.color === "y"
            ? "sarı"
            : board.okey.color === "b"
              ? "mavi"
              : "siyah"}
        ). Sahte okeyler bu taşın yerine geçer; okey taşı ise joker olarak her
        taşın yerini tutar.
      </p>
      <p className="ct-versus-panel-note">
        On dört taş, her grup en az üç: aynı renkten sıra ya da aynı sayıdan
        farklı renkler.
      </p>
      {board.target > 0 ? (
        <p className="ct-versus-panel-note">
          Her el kaybeden 20 ceza puanı alır. {board.target} puana ulaşan elenir.
        </p>
      ) : null}
    </div>
  );
}

function isSameTile(left: MinigameRummyTile, right: MinigameRummyTile): boolean {
  return left.value !== 0 && left.color === right.color && left.value === right.value;
}

/** Whose discard you may take: the seat before you that is still playing. */
function previousSeat(out: readonly boolean[], seat: number): number {
  if (seat < 0 || out.length === 0) {
    return -1;
  }
  for (let step = 1; step <= out.length; step++) {
    const candidate = ((seat - step) % out.length + out.length) % out.length;
    if (!out[candidate]) {
      return candidate;
    }
  }
  return -1;
}
