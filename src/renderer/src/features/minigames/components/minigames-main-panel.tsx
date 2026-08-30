import { useEffect, useRef, useState } from "react";
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { scoreKey } from "@/store/minigame-scores";
import { useUiStore } from "@/store/ui-store";
import { describeDifficulty, isSoloGameId } from "../difficulty";
import { findMinigame, seatsOf } from "../minigames-catalog";
import { useScoreSync } from "../use-score-sync";
import { DifficultyPicker } from "./difficulty-picker";
import { GameInfoDialog } from "./game-info-dialog";
import { LiveTables } from "./live-tables";
import { MinigameLeaderboard } from "./minigame-leaderboard";

interface MinigamesMainPanelProps {
  currentUserId: string;
}

/**
 * The page: a header that says what you are playing, the board, and one rail.
 *
 * Holds neither the match nor the run — the board's own hook owns the first and
 * the board owns the second — so nothing about a game in progress re-renders
 * the workspace around it.
 *
 * THE RAIL IS ALWAYS THERE, and that is the layout decision the rest of the
 * page hangs off. Before, the column beside the board existed only for the four
 * games that keep a record, so picking XOX after 2048 collapsed a 230px track
 * and slid the whole page sideways. It is one fixed width now, in every game,
 * and it carries whatever that game has to put in it: the leaderboard for a
 * solo game, and the live tables for all seven.
 *
 * The header spans the BOARD column and not the rail, for the same family of
 * reason. The difficulty picker sits at the far end of it, and with the header
 * stretched across both tracks that put it above the leaderboard — a control
 * hovering over something it does not control.
 *
 * Keyed by game AND difficulty. Without the key React would reuse one game's
 * component instance for the next (same position, same element type is enough
 * when the component is read out of a variable), and the second game would open
 * holding the first one's state. Difficulty is in the key for the same reason
 * turned inside out: changing the board size mid-run is not a thing that can be
 * patched onto a board already in play, so it deals a new one.
 */
export function MinigamesMainPanel({ currentUserId }: MinigamesMainPanelProps) {
  const selected = useUiStore((state) => state.selectedMinigame);
  const difficulty = useUiStore(
    (state) => state.minigameDifficulty[state.selectedMinigame],
  );
  const setDifficulty = useUiStore((state) => state.setMinigameDifficulty);
  const best = useUiStore(
    (state) =>
      state.minigameBestScores[
        scoreKey(
          state.selectedMinigame,
          state.minigameDifficulty[state.selectedMinigame],
        )
      ],
  );

  const [infoOpen, setInfoOpen] = useState(false);

  // The whole page goes fullscreen, not the board: the board is sized off this
  // element's container query, so promoting it on its own would leave it
  // measuring the window-sized page behind it. Taking the page takes the header
  // and the rail with it, which is also what keeps the leaderboard readable.
  const pageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = (): void => {
      setIsFullscreen(document.fullscreenElement === pageRef.current);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void pageRef.current?.requestFullscreen().catch(() => undefined);
  };

  const entry = findMinigame(selected);
  const { Component } = entry;
  const isSolo = isSoloGameId(selected);

  useEffect(() => {
    const { seenMinigameRules, markMinigameRulesSeen } = useUiStore.getState();
    if (seenMinigameRules.has(selected)) {
      setInfoOpen(false);
      return;
    }
    setInfoOpen(true);
    markMinigameRulesSeen(selected);
  }, [selected]);

  // Mounted HERE rather than per game: it reconciles every record at once, and
  // one sync that runs while the page is open beats four that each run when
  // their own game is picked. The counter it hands back is "the server now has
  // this run", which is what the board waits for instead of racing it.
  const syncedAt = useScoreSync();

  return (
    // The wrapper exists to be a SIZE CONTAINER, and only for that. The board
    // sizes itself from the height it actually has, and the only element that
    // knows that height is one the grid does not have to measure -- a container
    // on the grid item itself is size-CONTAINED, so it reports a zero width to
    // the auto track and the column collapses around the page header.
    <div className="ct-minigames-page" ref={pageRef}>
      <div className="ct-minigames-panel">
        <header className="ct-minigames-header">
          <span className="ct-minigames-header-icon" aria-hidden="true">
            {entry.icon}
          </span>

          <div className="ct-minigames-header-text">
            <h4>{entry.label}</h4>
            <p className="ct-minigames-header-description">
              {isSolo
                ? describeDifficulty(selected, difficulty)
                : entry.description}
            </p>
          </div>

          {/* The record for THIS board, not for the game: a nine-second 9x9 is not
            a record on a 30x16 field, and showing one number for both would be
            a lie in whichever direction the player last played. */}
          {best !== undefined && entry.formatScore ? (
            <span className="ct-minigames-best">
              <span className="ct-minigames-best-label">Rekor</span>
              <strong>{entry.formatScore(best)}</strong>
            </span>
          ) : null}

          {isSolo ? (
            <DifficultyPicker
              game={selected}
              value={difficulty}
              onChange={(next) => setDifficulty(selected, next)}
            />
          ) : null}

          <button
            type="button"
            className="ct-minigames-info-button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
            title={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
          >
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>

          <button
            type="button"
            className="ct-minigames-info-button"
            onClick={() => setInfoOpen(true)}
            aria-label={`${entry.label} nasıl oynanır`}
            title="Nasıl oynanır"
          >
            <QuestionCircleOutlined />
          </button>
        </header>

        <Component
          key={`${selected}:${difficulty}`}
          currentUserId={currentUserId}
          difficulty={difficulty}
        />

        {/* One rail, one card, and which card it is follows from what the game
          has to rank. A solo game keeps records and has no table to watch; a
          two-player game is the other way round in both halves. Showing both
          everywhere gave each of them half a rail and left one of them empty. */}
        <div className="ct-minigames-rail">
          {isSolo && entry.formatScore ? (
            <MinigameLeaderboard
              // Remounted per board, which is what resets the difficulty this card
              // is READING to the one being played.
              key={`${selected}:${difficulty}`}
              game={selected}
              difficulty={difficulty}
              currentUserId={currentUserId}
              syncedAt={syncedAt}
              formatScore={entry.formatScore}
            />
          ) : (
            <LiveTables currentUserId={currentUserId} />
          )}
        </div>
      </div>

      {infoOpen ? (
        <GameInfoDialog
          entry={entry}
          seats={seatsOf(selected)}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}
