import { useEffect, useMemo, useState } from "react";
import { Button, Tag } from "antd";
import type { MinigameRummyMeld, MinigameRummyTile } from "@shared/minigames";
import type { VersusViewProps } from "../../versus-view";
import { useMinigameCue } from "../../use-minigame-cue";
import { OkeyTile } from "../card-art";

const OPEN_THRESHOLD = 101;

function isOkeyTile(tile: MinigameRummyTile, okey: MinigameRummyTile): boolean {
  return tile.value !== 0 && tile.color === okey.color && tile.value === okey.value;
}

function tileValue(tile: MinigameRummyTile, okey: MinigameRummyTile): number {
  if (tile.value === 0) {
    return okey.value;
  }
  return tile.value;
}

function groupValue(
  tiles: MinigameRummyTile[],
  okey: MinigameRummyTile,
): { kind: string; value: number } | null {
  if (tiles.length === 2) {
    const [left, right] = tiles;
    const leftWild = isOkeyTile(left, okey);
    const rightWild = isOkeyTile(right, okey);
    if (leftWild && rightWild) {
      return { kind: "pair", value: okey.value * 2 };
    }
    if (leftWild || rightWild) {
      const real = leftWild ? right : left;
      return { kind: "pair", value: tileValue(real, okey) * 2 };
    }
    const a = left.value === 0 ? okey : left;
    const b = right.value === 0 ? okey : right;
    if (a.color !== b.color || a.value !== b.value) {
      return null;
    }
    return { kind: "pair", value: a.value * 2 };
  }

  if (tiles.length < 3) {
    return null;
  }

  const known: MinigameRummyTile[] = [];
  let wilds = 0;
  for (const tile of tiles) {
    if (isOkeyTile(tile, okey)) {
      wilds += 1;
      continue;
    }
    known.push(tile.value === 0 ? okey : tile);
  }

  const sameValue =
    known.length > 0 && known.every((tile) => tile.value === known[0].value);
  const colors = new Set(known.map((tile) => tile.color));
  if (sameValue && colors.size === known.length && tiles.length <= 4) {
    return { kind: "set", value: known[0].value * tiles.length };
  }

  if (known.length === 0) {
    return null;
  }
  const runColor = known[0].color;
  if (!known.every((tile) => tile.color === runColor)) {
    return null;
  }
  const values = known.map((tile) => tile.value).sort((a, b) => a - b);
  if (new Set(values).size !== values.length) {
    return null;
  }

  for (let start = 1; start + tiles.length - 1 <= 13; start += 1) {
    const needed: number[] = [];
    for (let step = 0; step < tiles.length; step += 1) {
      needed.push(start + step);
    }
    const pool = [...values];
    let spare = wilds;
    let total = 0;
    let fits = true;
    for (const value of needed) {
      const at = pool.indexOf(value);
      if (at >= 0) {
        pool.splice(at, 1);
        total += value;
        continue;
      }
      if (spare === 0) {
        fits = false;
        break;
      }
      spare -= 1;
      total += value;
    }
    if (fits && pool.length === 0 && spare === 0) {
      return { kind: "run", value: total };
    }
  }

  return null;
}

export function Okey101Board({
  table,
  mySeat,
  isMyTurn,
  isBusy,
  onMove,
}: VersusViewProps) {
  const board = table.rummy;

  const [order, setOrder] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [dragging, setDragging] = useState<number | null>(null);

  const handSize = board && mySeat >= 0 ? board.hands[mySeat]?.length ?? 0 : 0;

  useEffect(() => {
    setOrder((current) => {
      const kept = current.filter((index) => index < handSize);
      const missing = Array.from({ length: handSize }, (_, index) => index).filter(
        (index) => !kept.includes(index),
      );
      return [...kept, ...missing];
    });
    setPicked([]);
    setGroups([]);
  }, [handSize]);

  useMinigameCue(
    "tileClack",
    board
      ? board.pile * 1000 + board.discards.reduce((total, pile) => total + pile.length, 0)
      : 0,
  );

  const melds = useMemo(() => board?.melds ?? [], [board]);

  if (!board) {
    return null;
  }

  const hand = mySeat >= 0 ? board.hands[mySeat] ?? [] : [];
  const opened = board.opened?.[mySeat] ?? false;
  const openedPairs = board.openedPairs?.[mySeat] ?? false;
  const previous = previousSeat(board.out, mySeat);
  const takeable = previous >= 0 ? board.discards[previous]?.at(-1) : undefined;

  const staged = groups.map((group) => {
    const tiles = group.map((index) => hand[index]).filter(Boolean);
    return { indices: group, tiles, meld: groupValue(tiles, board.okey) };
  });
  const stagedTotal = staged.reduce((total, entry) => total + (entry.meld?.value ?? 0), 0);
  const stagedValid = staged.length > 0 && staged.every((entry) => entry.meld !== null);
  const allPairs = staged.every((entry) => entry.meld?.kind === "pair");
  const inGroup = new Set(groups.flat());

  const togglePick = (index: number): void => {
    if (inGroup.has(index)) {
      return;
    }
    setPicked((current) =>
      current.includes(index)
        ? current.filter((entry) => entry !== index)
        : [...current, index],
    );
  };

  const stageGroup = (): void => {
    if (picked.length < 2) {
      return;
    }
    setGroups((current) => [...current, [...picked]]);
    setPicked([]);
  };

  const unstage = (at: number): void => {
    setGroups((current) => current.filter((_, index) => index !== at));
  };

  const drop = (target: number): void => {
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

  const sendOpen = (): void => {
    onMove(`open:${groups.map((group) => group.join(",")).join("|")}`);
    setGroups([]);
    setPicked([]);
  };

  const workOnto = (meldIndex: number): void => {
    if (picked.length !== 1) {
      return;
    }
    onMove(`add:${meldIndex}:${picked[0]}`);
    setPicked([]);
  };

  const canOpen =
    isMyTurn &&
    board.drawn &&
    !isBusy &&
    !opened &&
    stagedValid &&
    stagedTotal >= OPEN_THRESHOLD &&
    (!allPairs || staged.length >= 5);

  return (
    <div className="ct-board ct-felt ct-okey101-board" aria-label="101 Okey masası">
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

      <div className="ct-okey101-melds" aria-label="Masadaki perler">
        {melds.length === 0 ? (
          <p className="ct-okey101-melds-empty">
            Masada henüz açılmış per yok. Açmak için en az {OPEN_THRESHOLD} puanlık grup
            gerekir.
          </p>
        ) : (
          melds.map((meld, index) => (
            <MeldGroup
              key={index}
              meld={meld}
              okey={board.okey}
              name={table.players[meld.owner]?.username ?? `${meld.owner + 1}.`}
              canWork={opened && picked.length === 1 && isMyTurn && board.drawn && !isBusy}
              onWork={() => workOnto(index)}
            />
          ))
        )}
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
              disabled={
                !isMyTurn || board.drawn || isBusy || !isSource || !top || openedPairs
              }
              onClick={() => onMove("take")}
              aria-label={`${table.players[seat]?.username ?? seat + 1} ıskartası`}
            >
              <span className="ct-rummy-discard-name">
                <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
                {table.players[seat]?.username ?? `${seat + 1}.`}
                {board.opened?.[seat] ? " ✓" : ""}
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
          {!opened ? (
            <div className="ct-okey101-staging" aria-label="Açılacak gruplar">
              <div className="ct-okey101-staging-head">
                <span>
                  Açılış:{" "}
                  <strong data-enough={stagedTotal >= OPEN_THRESHOLD ? "true" : undefined}>
                    {stagedTotal}
                  </strong>
                  /{OPEN_THRESHOLD}
                </span>
                <Button
                  size="small"
                  disabled={picked.length < 2}
                  onClick={stageGroup}
                >
                  Seçilenleri grup yap
                </Button>
              </div>

              {staged.length === 0 ? (
                <p className="ct-okey101-staging-hint">
                  Istakadan taşları seç, grup yap. Per: aynı sayı farklı renkler. Seri:
                  aynı renk ardışık sayılar. 13'ten sonra 1 gelmez.
                </p>
              ) : (
                <ul className="ct-okey101-staged">
                  {staged.map((entry, index) => (
                    <li
                      key={index}
                      className="ct-okey101-staged-group"
                      data-bad={entry.meld ? undefined : "true"}
                    >
                      <span className="ct-okey101-staged-tiles">
                        {entry.tiles.map((tile, at) => (
                          <OkeyTile
                            key={at}
                            tile={tile}
                            isOkey={isSameTile(tile, board.okey)}
                          />
                        ))}
                      </span>
                      <span className="ct-okey101-staged-value">
                        {entry.meld ? `${entry.meld.value}` : "geçersiz"}
                      </span>
                      <Button size="small" type="text" onClick={() => unstage(index)}>
                        Boz
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="ct-okey101-opened">
              Elini açtın{openedPairs ? " (çiftten)" : ""}. Taşlarını masadaki perlere
              işleyebilirsin — bir taş seç, sonra pere tıkla.
            </p>
          )}

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
                        data-staged={inGroup.has(index) ? "true" : undefined}
                        onClick={() => togglePick(index)}
                      >
                        <OkeyTile
                          tile={tile}
                          selected={picked.includes(index)}
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
              disabled={
                !isMyTurn || board.drawn || isBusy || !takeable || openedPairs
              }
              onClick={() => onMove("take")}
            >
              Iskartadan al
            </Button>
            <Button type="primary" disabled={!canOpen} onClick={sendOpen}>
              El aç ({stagedTotal})
            </Button>
            <Button
              disabled={
                !isMyTurn || !board.drawn || isBusy || picked.length !== 1 || hand.length === 1
              }
              onClick={() => {
                onMove(`discard:${picked[0]}`);
                setPicked([]);
              }}
            >
              At
            </Button>
            <Button
              danger
              disabled={
                !isMyTurn ||
                !board.drawn ||
                isBusy ||
                !opened ||
                hand.length !== 1 ||
                picked.length !== 1
              }
              onClick={() => {
                onMove(`finish:${picked[0]}`);
                setPicked([]);
              }}
            >
              Bitir
            </Button>
          </div>

          <p className="ct-rummy-hint">
            {opened
              ? "Elinde tek taş kalınca Bitir ile o taşı atarak eli bitirirsin. Okey atarak bitirirsen puanlar iki katına çıkar."
              : `Açmak için masaya en az ${OPEN_THRESHOLD} puanlık per/seri koymalısın. Çiftten açmak için en az 5 çift gerekir.`}
          </p>
        </>
      )}
    </div>
  );
}

function MeldGroup({
  meld,
  okey,
  name,
  canWork,
  onWork,
}: {
  meld: MinigameRummyMeld;
  okey: MinigameRummyTile;
  name: string;
  canWork: boolean;
  onWork: () => void;
}) {
  return (
    <button
      type="button"
      className="ct-okey101-meld"
      data-kind={meld.kind}
      disabled={!canWork}
      onClick={onWork}
      aria-label={`${name} peri, ${meld.tiles.length} taş`}
    >
      <span className="ct-okey101-meld-owner">
        <span className="ct-versus-mark" data-seat={meld.owner} aria-hidden="true" />
        {name}
      </span>
      <span className="ct-okey101-meld-tiles">
        {meld.tiles.map((tile, index) => (
          <OkeyTile key={index} tile={tile} isOkey={isSameTile(tile, okey)} />
        ))}
      </span>
    </button>
  );
}

export function Okey101Aside({ table, mySeat }: VersusViewProps) {
  const board = table.rummy;
  if (!board) {
    return null;
  }

  return (
    <div className="ct-versus-panel">
      <span className="ct-versus-panel-title">Puan durumu</span>
      <ul className="ct-versus-scorelist">
        {board.penalties.map((score, seat) => (
          <li
            key={seat}
            className="ct-versus-scorerow"
            data-alert={board.out[seat] ? "true" : undefined}
          >
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            <span className="ct-versus-scorename">
              {table.players[seat]?.username ?? `${seat + 1}. oyuncu`}
              {seat === mySeat ? " (sen)" : ""}
            </span>
            <strong>{score}</strong>
            {board.out[seat] ? (
              <span className="ct-versus-scorenote">elendi</span>
            ) : board.opened?.[seat] ? (
              <span className="ct-versus-scorenote">açtı</span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="ct-okey101-legend">
        <Tag>Bitiren −101</Tag>
        <Tag>Açmayan +202</Tag>
        <Tag color="gold">Okeyle bitiş ×2</Tag>
        <Tag color="purple">Çiftten ×2</Tag>
      </div>

      <p className="ct-versus-panel-note">
        {board.target > 0
          ? `Cezası ${board.target} puana ulaşan elenir; son kalan kazanır.`
          : "Tek el oynanır."}
      </p>
    </div>
  );
}

function isSameTile(left: MinigameRummyTile, right: MinigameRummyTile): boolean {
  return left.color === right.color && left.value === right.value;
}

function previousSeat(out: boolean[], seat: number): number {
  if (seat < 0) {
    return -1;
  }
  const seats = out.length;
  for (let step = 1; step <= seats; step += 1) {
    const candidate = ((seat - step) % seats + seats) % seats;
    if (!out[candidate]) {
      return candidate;
    }
  }
  return -1;
}
