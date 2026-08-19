import { useCallback, useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { ReloadOutlined, TrophyOutlined } from "@ant-design/icons";
import { toErrorMessage } from "@shared/error-message";
import type { MinigameLeaderboard as Board } from "@shared/minigames";
import type { MinigameId } from "@/store/minigame-scores";
import { scoreService } from "../score-service";

interface MinigameLeaderboardProps {
  game: MinigameId;
  currentUserId: string;
  /**
   * Bumped by useScoreSync once a submission has landed. NOT the local record:
   * that changes the instant the game ends, which is before the score has been
   * sent, and refetching then reads a board that does not have the run on it
   * yet.
   */
  syncedAt: number;
  /** Renders the score the way the sidebar does — "1200 puan", "45 saniye". */
  formatScore: (score: number) => string;
}

// Somebody else beating your time arrives on no channel, so the board has to
// ask. Slow on purpose: this is a friend-group app, a record is a rare event,
// and the request is one row per player.
//
// ponytail: a poll, not a push. The push exists next door -- the lobby socket
// already carries minigame table frames -- but wiring a score event through it
// means a broadcaster on the score store, an event type, an IPC frame and a
// validator, for a number that changes a few times a day. Upgrade if a board
// being twenty seconds stale ever actually matters.
const POLL_MS = 20_000;

/**
 * One game's board.
 *
 * Refetched on three things: the game changing, a submission landing, and the
 * poll. The refresh button stays because it costs nothing and answers "now,
 * please" — but nothing on this page depends on it any more.
 */
export function MinigameLeaderboard({
  game,
  currentUserId,
  syncedAt,
  formatScore,
}: MinigameLeaderboardProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the refresh button and by the poll. A counter rather than a
  // boolean so two in a row are two refetches.
  const [reloadNonce, setReloadNonce] = useState(0);

  const refresh = useCallback(() => setReloadNonce((value) => value + 1), []);

  // Unmounted with the page, which is what stops it running behind a lobby.
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

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
  }, [game, syncedAt, reloadNonce]);

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
