import { useCallback, useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { ReloadOutlined, TrophyOutlined } from "@ant-design/icons";
import { toErrorMessage } from "@shared/error-message";
import type { MinigameLeaderboard as Board } from "@shared/minigames";
import { DIFFICULTY_IDS, scoreKey, type DifficultyId } from "@/store/minigame-scores";
import { DIFFICULTY_LABELS, describeDifficulty, type SoloGameId } from "../difficulty";
import { scoreService } from "../score-service";

interface MinigameLeaderboardProps {
  game: SoloGameId;
  /**
   * The board being played. It is the difficulty this card OPENS on, not the
   * one it is stuck with — the panel remounts this component when it changes,
   * which is what resets the choice below back to it.
   */
  difficulty: DifficultyId;
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
 * One board, for one game at one difficulty — and a way to read the other two.
 *
 * Every difficulty is its own ranking, all the way down: the desktop files a
 * record under "game:difficulty", internal/minigame/score.go ranks by that same
 * composite key and bounds each one against its own board, and a nine-second
 * 9x9 field has never been comparable to a nine-second 30x16 one. What was
 * missing was any way to SEE that. The card showed exactly the difficulty the
 * board happened to be set to, so the only way to find out who was fastest on
 * Zor was to switch your own game to Zor and throw away the run in progress.
 *
 * The three tabs read; they do not play. Nothing here touches the board, which
 * is the whole point — comparing yourself against Zor is a thing you do while
 * playing Kolay.
 *
 * Refetched on four things: the game changing, the tab changing, a submission
 * landing, and the poll. The refresh button stays because it costs nothing and
 * answers "now, please" — but nothing on this page depends on it any more.
 */
export function MinigameLeaderboard({
  game,
  difficulty,
  currentUserId,
  syncedAt,
  formatScore,
}: MinigameLeaderboardProps) {
  const [scope, setScope] = useState<DifficultyId>(difficulty);
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

  const key = scoreKey(game, scope);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void scoreService.leaderboard(key).then((result) => {
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
  }, [key, syncedAt, reloadNonce]);

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

      {/* Three boards, not three views of one. The tab that matches the board
          in play is marked so the card never quietly stops describing the game
          under it. */}
      <div className="ct-leaderboard-scopes" role="tablist" aria-label="Zorluk sıralaması">
        {DIFFICULTY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === scope}
            className="ct-leaderboard-scope"
            data-active={id === scope ? "true" : undefined}
            data-playing={id === difficulty ? "true" : undefined}
            title={describeDifficulty(game, id)}
            onClick={() => setScope(id)}
          >
            {DIFFICULTY_LABELS[id]}
          </button>
        ))}
      </div>

      <p className="ct-leaderboard-scope-hint">{describeDifficulty(game, scope)}</p>

      {error ? (
        <p className="ct-leaderboard-empty">{error}</p>
      ) : isLoading && !board ? (
        <div className="ct-leaderboard-empty">
          <Spin size="small" />
        </div>
      ) : !board || board.entries.length === 0 ? (
        <p className="ct-leaderboard-empty">
          {DIFFICULTY_LABELS[scope]} zorlukta henüz kimse skor bırakmadı. İlkini sen
          bırak.
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
