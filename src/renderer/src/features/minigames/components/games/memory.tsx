import { useEffect, useState } from "react";
import { Button } from "antd";
import { shuffle } from "../../minigames-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";

// Eight pairs. Emoji rather than image files on purpose: the page ships no
// assets at all, so it adds nothing to the installer and needs no host on the
// renderer CSP -- see the img-src list in index.html for what that costs.
const SYMBOLS = ["🍒", "🍋", "🍇", "🥝", "🌶", "🥑", "🍑", "🥥"] as const;

const MATCH_PAUSE_MS = 350;
const MISS_PAUSE_MS = 700;

const dealCards = (): string[] => shuffle([...SYMBOLS, ...SYMBOLS]);

export function Memory() {
  const [cards, setCards] = useState<string[]>(dealCards);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  // The pair that just failed, so the two cards can flash before they turn
  // back. Cleared by the same timer that turns them.
  const [missed, setMissed] = useState<number[]>([]);

  const hasWon = matched.length === cards.length;
  const isRecord = useRecordRun("memory", hasWon, moves);

  useEffect(() => {
    if (flipped.length !== 2) {
      return;
    }

    const [first, second] = flipped;
    const isPair = cards[first] === cards[second];
    if (!isPair) {
      setMissed([first, second]);
    }

    // The pause is the game: turning a miss face-down instantly leaves nothing
    // to remember. Cleared on unmount so leaving the page mid-pair cannot
    // resolve a pair into a board that no longer exists.
    const timer = setTimeout(
      () => {
        if (isPair) {
          setMatched((current) => [...current, first, second]);
        }
        setFlipped([]);
        setMissed([]);
      },
      isPair ? MATCH_PAUSE_MS : MISS_PAUSE_MS,
    );

    return () => clearTimeout(timer);
  }, [flipped, cards]);

  const reset = () => {
    setCards(dealCards());
    setFlipped([]);
    setMatched([]);
    setMissed([]);
    setMoves(0);
  };

  const handleFlip = (index: number) => {
    // Two already up means the pause is still running; a third card here would
    // let a fast clicker walk the whole board without ever seeing a miss.
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) {
      return;
    }

    const next = [...flipped, index];
    setFlipped(next);
    // Counted on the second card, so a move is a guess rather than a click.
    if (next.length === 2) {
      setMoves((value) => value + 1);
    }
  };

  return (
    <div className="ct-minigame">
      <div className="ct-minigame-bar">
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Hamle</span>
          <strong>{moves}</strong>
        </span>
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Çift</span>
          <strong>
            {matched.length / 2}/{cards.length / 2}
          </strong>
        </span>
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      </div>

      <div className="ct-minigame-stage">
        <div
          className="ct-minigame-board ct-memory-board"
          aria-label="Hafıza tahtası"
          data-state={hasWon ? "won" : undefined}
        >
          {cards.map((symbol, index) => {
            const isUp = flipped.includes(index) || matched.includes(index);

            return (
              <button
                key={index}
                type="button"
                className="ct-memory-card"
                data-up={isUp ? "true" : undefined}
                data-matched={matched.includes(index) ? "true" : undefined}
                data-missed={missed.includes(index) ? "true" : undefined}
                onClick={() => handleFlip(index)}
                aria-label={isUp ? symbol : "Kapalı kart"}
              >
                {/* Two faces, both always rendered. A real flip needs something
                    on the back of the card, and swapping the text mid-rotation
                    shows the symbol through the back at ninety degrees. */}
                <span className="ct-memory-face" data-side="back" aria-hidden="true" />
                <span className="ct-memory-face" data-side="front">
                  {symbol}
                </span>
              </button>
            );
          })}
        </div>

        {hasWon ? (
          <GameOutcome
            tone="won"
            title="Hepsini buldun"
            detail={`${moves} hamle`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null}
      </div>

      <p className="ct-minigame-hint">
        Aynı iki kartı bul. Kartlar eşleşmezse geri kapanır.
      </p>
    </div>
  );
}
