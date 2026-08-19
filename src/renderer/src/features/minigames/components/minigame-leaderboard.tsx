import { useCallback, useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { ReloadOutlined, TrophyOutlined } from "@ant-design/icons";
import { toErrorMessage } from "@shared/error-message";
import type { MinigameLeaderboard as Board } from "@shared/minigames";
import type { MinigameId } from "@/store/minigame-scores";
import { useUiStore } from "@/store/ui-store";
import { scoreService } from "../score-service";

interface MinigameLeaderboardProps {
  game: MinigameId;
  currentUserId: string;
  /** Renders the score the way the sidebar does — "1200 puan", "45 saniye". */
  formatScore: (score: number) => string;
}

/**
 * One game's board.
 *
 * Refetched whenever the account's own record for this game changes, which is
 * the only event that can move it from here — somebody else's run arrives on no
 * channel, so the manual refresh is the answer to "did anyone beat me". A
 * websocket for a page nobody is staring at would be a stream for an errand.
 */
export function MinigameLeaderboard({
  game,
  currentUserId,
  formatScore,
}: MinigameLeaderboardProps) {
  const myBest = useUiStore((state) => state.minigameBestScores[game]);
  const [board, setBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the refresh button. A counter rather than a boolean so pressing
  // it twice in a row refetches twice.
  const [reloadNonce, setReloadNonce] = useState(0);

  const refresh = useCallback(() => setReloadNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void scoreService.leaderboard(game).then((result) => {
      if (cancelled) {
        return;
      }
      setIsLoading(false);
      if (!result.ok) {
        setError(toErrorMessage(result.error, "Sıralama alınamadı."));
        setBoard(null);
        return;
      }
      setError(null);
      setBoard(result.data ?? null);
    });

    return () => {
      cancelled = true;
    };
    // myBest is a dependency on purpose: a run that beats your own record moves
    // you up the board, and the board is on screen while you play.
  }, [game, myBest, reloadNonce]);

  return (
    <section className="ct-leaderboard" aria-label="Sıralama">
      <header className="ct-leaderboard-head">
        <h5>
          <TrophyOutlined aria-hidden="true" /> Sıralama
        </h5>
        <div className="ct-leaderboard-head-right">
          {/* Absent, not zero: rank 0 means "no record at this game yet", which
              is a different statement from "ranked last". */}
          {board && board.viewerRank > 0 ? (
            <span className="ct-leaderboard-rank">{board.viewerRank}. sıradasın</span>
          ) : null}
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={refresh}
            loading={isLoading}
            aria-label="Sıralamayı yenile"
          />
        </div>
      </header>

      {error ? (
        <p className="ct-leaderboard-empty">{error}</p>
      ) : isLoading && !board ? (
        <div className="ct-leaderboard-empty">
          <Spin size="small" />
        </div>
      ) : !board || board.entries.length === 0 ? (
        <p className="ct-leaderboard-empty">
          Bu oyunu henüz kimse oynamadı. İlk skoru sen bırak.
        </p>
      ) : (
        <ol className="ct-leaderboard-list">
          {board.entries.map((entry) => (
            <li
              key={entry.userId}
              className="ct-leaderboard-row"
              data-me={entry.userId === currentUserId ? "true" : undefined}
            >
              {/* The rank comes from the server and is NOT the list index: a
                  deactivated account is dropped from the rows but keeps its
                  place, so a gap here is the truth. */}
              <span className="ct-leaderboard-position">{entry.rank}</span>
              <span className="ct-leaderboard-name">
                {entry.displayName || entry.username}
              </span>
              <span className="ct-leaderboard-score">{formatScore(entry.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
