import { useUiStore } from "@/store/ui-store";
import { findMinigame } from "../minigames-catalog";
import { useScoreSync } from "../use-score-sync";
import { MinigameLeaderboard } from "./minigame-leaderboard";

interface MinigamesMainPanelProps {
  currentUserId: string;
}

/**
 * The board.
 *
 * Holds neither the selection nor the scores nor the match — the store owns the
 * first two and the board's own hook owns the third — so nothing about a game
 * in progress re-renders the workspace around it.
 *
 * Keyed by game id. Without the key React would reuse one game's component
 * instance for the next: same position, same element type is enough for that
 * when the component is read out of a variable, and the second game would open
 * holding the first one's state.
 */
export function MinigamesMainPanel({ currentUserId }: MinigamesMainPanelProps) {
  const selected = useUiStore((state) => state.selectedMinigame);
  const best = useUiStore((state) => state.minigameBestScores[state.selectedMinigame]);
  const entry = findMinigame(selected);
  const { Component } = entry;

  // Mounted HERE rather than per game: it reconciles every record at once, and
  // one sync that runs while the page is open beats four that each run when
  // their own game is picked.
  useScoreSync();

  return (
    <div className="ct-minigames-panel">
      <header className="ct-minigames-header">
        <div>
          <h4>{entry.label}</h4>
          <p className="ct-minigames-header-description">{entry.description}</p>
        </div>
        {best !== undefined && entry.formatScore ? (
          <span className="ct-minigames-best">Rekor: {entry.formatScore(best)}</span>
        ) : null}
      </header>

      <Component key={selected} currentUserId={currentUserId} />

      {/* Solo games only. A two-player table has a winner, not a record, and
          formatScore is exactly the field that is absent for those. */}
      {entry.formatScore ? (
        <MinigameLeaderboard
          game={entry.id}
          currentUserId={currentUserId}
          formatScore={entry.formatScore}
        />
      ) : null}
    </div>
  );
}
