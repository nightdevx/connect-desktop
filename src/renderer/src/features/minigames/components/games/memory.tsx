import { useEffect, useState } from "react";
import { Button } from "antd";
import { useUiStore } from "@/store/ui-store";
import { shuffle } from "../../minigames-logic";

// Eight pairs. Emoji rather than image files on purpose: the page ships no
// assets at all, so it adds nothing to the installer and needs no host on the
// renderer CSP -- see the img-src list in index.html for what that costs.
const SYMBOLS = ["🍒", "🍋", "🍇", "🥝", "🌶", "🥑", "🍑", "🥥"] as const;

const MATCH_PAUSE_MS = 350;
const MISS_PAUSE_MS = 700;

const dealCards = (): string[] => shuffle([...SYMBOLS, ...SYMBOLS]);

export function Memory() {
  const recordScore = useUiStore((state) => state.recordMinigameScore);
  const [cards, setCards] = useState<string[]>(dealCards);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const hasWon = matched.length === cards.length;

  useEffect(() => {
    if (flipped.length !== 2) {
      return;
    }

    const [first, second] = flipped;
    const isPair = cards[first] === cards[second];
    // The pause is the game: turning a miss face-down instantly leaves nothing
    // to remember. Cleared on unmount so leaving the page mid-pair cannot
    // resolve a pair into a board that no longer exists.
    const timer = setTimeout(
      () => {
        if (isPair) {
          setMatched((current) => [...current, first, second]);
        }
        setFlipped([]);
      },
      isPair ? MATCH_PAUSE_MS : MISS_PAUSE_MS,
    );

    return () => clearTimeout(timer);
  }, [flipped, cards]);

  useEffect(() => {
    if (hasWon) {
      recordScore("memory", moves);
    }
  }, [hasWon, moves, recordScore]);

  const reset = () => {
    setCards(dealCards());
    setFlipped([]);
    setMatched([]);
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
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      </div>

      <div className="ct-minigame-board ct-memory-board" aria-label="Hafıza tahtası">
        {cards.map((symbol, index) => {
          const isUp = flipped.includes(index) || matched.includes(index);

          return (
            <button
              key={index}
              type="button"
              className="ct-memory-card"
              data-up={isUp ? "true" : undefined}
              data-matched={matched.includes(index) ? "true" : undefined}
              onClick={() => handleFlip(index)}
              aria-label={isUp ? symbol : "Kapalı kart"}
            >
              {isUp ? symbol : ""}
            </button>
          );
        })}
      </div>

      <p className="ct-minigame-hint">
        {hasWon
          ? `Bitti — ${moves} hamle.`
          : "Aynı iki kartı bul. Kartlar eşleşmezse geri kapanır."}
      </p>
    </div>
  );
}
