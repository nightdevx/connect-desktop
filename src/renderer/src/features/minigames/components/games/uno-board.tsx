import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import type { VersusViewProps } from "../../versus-view";
import type { MinigameUnoBoard, MinigameUnoCard } from "@shared/minigames";
import { UnoCardArt } from "../card-art";
import { useMinigameCue } from "../../use-minigame-cue";
import type { UnoSceneLabel, UnoSceneSeat, UnoTableScene } from "../../uno-3d/scene";

const COLOR_NAMES: Record<string, string> = {
  r: "Kırmızı",
  y: "Sarı",
  g: "Yeşil",
  b: "Mavi",
};

/** The whole matching rule, mirrored from unoPlayable in the Go engine. */
function isPlayable(card: MinigameUnoCard, board: MinigameUnoBoard): boolean {
  return card.color === "w" || card.color === board.color || card.kind === board.top.kind;
}

/**
 * Son Kart, two to ten, drawn as a real table in WebGL.
 *
 * The other players' hands arrive EMPTY -- the server cuts each snapshot for
 * the account reading it -- so there is nothing here that could leak a card.
 * What everyone does get is the COUNT beside each name, which is the fact the
 * whole game is played on: "Ali has one left" is the most important thing at
 * the table and hiding it would make the game unreadable.
 *
 * A face-down card is a mesh with the BACK texture on both of its faces. There
 * is no face on it to reveal. Somebody will open the inspector.
 *
 * There are no move buttons. The deck IS the control: clicking it draws, and
 * clicking it again once you have drawn ends the turn. When the card you drew
 * leaves you holding nothing legal the turn ends on its own, because in that
 * position passing is the only move the server would accept anyway.
 *
 * Playing a wild opens a colour picker instead of sending straight away,
 * because the colour is part of the move -- a server that had to ask for it
 * afterwards would need a half-played state to sit in.
 */
export function UnoBoard({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) {
  const board = table.uno;
  const [wildIndex, setWildIndex] = useState<number | null>(null);
  const [labels, setLabels] = useState<UnoSceneLabel[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<UnoTableScene | null>(null);
  const turnRef = useRef(table.turn);
  const topRef = useRef<string | null>(null);
  const playedByRef = useRef(-1);
  const autoPassRef = useRef("");

  // A card landing on the pile, whoever played it. Watched on the top card
  // rather than on a move result, because a snapshot is all the client is sent.
  useMinigameCue("cardThrow", board ? `${board.top.color}-${board.top.kind}` : "");

  const hand = useMemo<MinigameUnoCard[]>(
    () => (board && mySeat >= 0 ? board.hands[mySeat] ?? [] : []),
    [board, mySeat],
  );

  const playable = Boolean(board) && mySeat >= 0 && isMyTurn && !isBusy;

  const play = useCallback(
    (index: number) => {
      const card = hand[index];
      if (!card) {
        return;
      }
      if (card.color === "w") {
        setWildIndex(index);
        return;
      }
      onMove(`play:${index}`);
    },
    [hand, onMove],
  );

  const useDeck = useCallback(() => {
    if (!board || !playable) {
      return;
    }
    onMove(board.drawn ? "pass" : "draw");
  }, [board, playable, onMove]);

  const playRef = useRef(play);
  const deckRef = useRef(useDeck);
  playRef.current = play;
  deckRef.current = useDeck;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let scene: UnoTableScene | null = null;
    let cancelled = false;

    void import("../../uno-3d/scene")
      .then((module) => {
        if (cancelled) {
          return;
        }
        scene = new module.UnoTableScene(canvas, {
          onPlay: (index) => playRef.current(index),
          onDraw: () => deckRef.current(),
          onLabels: setLabels,
        });
        sceneRef.current = scene;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, []);

  const anchor = mySeat >= 0 ? mySeat : -1;
  const totalSeats = (board?.counts.length ?? 0) + (anchor < 0 ? 1 : 0);

  const seats = useMemo<UnoSceneSeat[]>(() => {
    if (!board) {
      return [];
    }
    return board.counts
      .map((count, seat) => ({
        seat,
        count,
        offset: anchor < 0 ? seat + 1 : (seat - anchor + totalSeats) % totalSeats,
      }))
      .filter((entry) => entry.seat !== anchor);
  }, [board, anchor, totalSeats]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !board) {
      return;
    }

    const topKey = `${board.top.color}${board.top.kind}`;
    if (topRef.current !== null && topRef.current !== topKey) {
      playedByRef.current = turnRef.current;
    }
    topRef.current = topKey;
    turnRef.current = table.turn;

    scene.setState({
      hand,
      seats,
      totalSeats,
      mySeat,
      playedBy: playedByRef.current,
      top: board.top,
      activeColor: board.color,
      pile: board.pile,
      direction: board.direction,
      playable,
    });
  }, [board, hand, seats, totalSeats, playable, ready, mySeat, table.turn]);

  // Drawn a card and still holding nothing legal: passing is the only move the
  // server would take, so it is sent rather than asked for. Fired once per
  // position, or it would spin against a server that refuses it.
  useEffect(() => {
    if (!board || !playable || !board.drawn) {
      return;
    }
    if (hand.some((card) => isPlayable(card, board))) {
      return;
    }

    const signature = `${hand.length}:${board.color}:${board.top.kind}`;
    if (autoPassRef.current === signature) {
      return;
    }
    autoPassRef.current = signature;
    onMove("pass");
  }, [board, hand, playable, onMove]);

  if (!board) {
    return null;
  }

  const hint = !playable
    ? null
    : board.drawn
      ? "Oynayacak kartın yoksa desteye tıkla, sıra geçsin"
      : "Bir kart oyna ya da desteden çek";

  return (
    <div className="ct-board ct-uno-board" aria-label="Son Kart masası">
      <div className="ct-uno-stage" data-failed={failed ? "true" : undefined}>
        <canvas ref={canvasRef} className="ct-uno-canvas" />

        {/* Ten chairs put ten labels round the same arc, and a name plus a
            count in each is more text than the space holds. Past five the name
            goes and the coloured mark carries the identity -- the aside panel
            still lists every name against its count. */}
        <div
          className="ct-uno-seats"
          data-dense={labels.length > 5 ? "true" : undefined}
          aria-hidden="true"
        >
          {labels.map((label) => {
            const count = board.counts[label.seat] ?? 0;
            return (
              <span
                key={label.seat}
                className="ct-uno-seat"
                style={{ left: `${label.x}%`, top: `${label.y}%` }}
                data-alert={count === 1 ? "true" : undefined}
              >
                <span className="ct-versus-mark" data-seat={label.seat} />
                <span className="ct-uno-seat-name">
                  {table.players[label.seat]?.username ?? `${label.seat + 1}. oyuncu`}
                </span>
                <strong className="ct-uno-seat-count">{count === 1 ? "SON!" : count}</strong>
              </span>
            );
          })}
        </div>

        {/* The colour in force and the card on the pile are different things
            after a wild, and only one of them is drawn on the card. */}
        <span className="ct-uno-color" data-color={board.color}>
          <span className="ct-uno-color-dot" />
          {COLOR_NAMES[board.color] ?? "—"}
        </span>

        <span className="ct-uno-pile-count">Deste {board.pile}</span>

        {hint ? <span className="ct-uno-hint">{hint}</span> : null}

        {failed ? (
          <p className="ct-uno-fallback">
            Bu makinede 3B masa açılamadı — kartlar aşağıda düz olarak oynanıyor.
            <UnoCardArt card={board.top} />
          </p>
        ) : null}
      </div>

      {mySeat < 0 ? (
        <p className="ct-uno-spectating">
          İzliyorsun — eller gizli, sadece kart sayıları görünüyor.
        </p>
      ) : (
        <div className="ct-uno-keys" data-fallback={failed ? "true" : undefined} aria-label="Elin">
          <button type="button" className="ct-uno-key-deck" disabled={!playable} onClick={useDeck}>
            {board.drawn ? "Sırayı geç" : `Desteden çek (${board.pile})`}
          </button>

          {hand.map((card, index) => (
            <button
              key={index}
              type="button"
              className="ct-uno-key"
              disabled={!playable}
              onClick={() => play(index)}
            >
              <UnoCardArt card={card} />
            </button>
          ))}
        </div>
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
              >
                <span className="ct-uno-swatch-name">{COLOR_NAMES[color]}</span>
              </button>
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
        seçersin. Desteye tıklamak kart çeker; oynayacak kartın kalmazsa sıra
        kendiliğinden geçer.
      </p>
    </div>
  );
}
