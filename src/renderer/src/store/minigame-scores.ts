/**
 * Personal bests for the games page.
 *
 * ponytail: localStorage, like the theme, the GIF playback mode and the emote
 * volume. These are solo games with no server behind them -- there is nothing
 * to compare against and nobody to compare with, so a record on the account
 * would be a table, a migration and an endpoint bought for a number only one
 * person ever reads. Upgrade path if a leaderboard is ever wanted: a
 * minigame_scores table beside lobby_rooms, and this becomes the offline cache.
 *
 * The id union lives here rather than in the feature because ui-store holds the
 * selection, and a store importing a feature closes the cycle that
 * scripts/check-architecture.cjs refuses.
 */

/**
 * Solo games keep a personal best; the two-player ids are here because the page
 * selection is one list. MultiplayerGameId in @shared/minigames is the same two
 * strings seen from the server's side, and the two unions are joined in the
 * catalogue rather than here -- this file must not import a wire type for a
 * feature it only stores a number for.
 */
export type MinigameId =
  | "2048"
  | "minesweeper"
  | "snake"
  | "memory"
  | "xox"
  | "connect4"
  | "chess";

export const MINIGAME_IDS: readonly MinigameId[] = [
  "2048",
  "minesweeper",
  "snake",
  "memory",
  "xox",
  "connect4",
  "chess",
];

/**
 * Which way is better, per game. Not every score is a number to maximise:
 * minesweeper is seconds and memory is moves, and treating those as
 * "higher wins" would freeze the record at the worst run the user ever had.
 *
 * The two-player games are absent, which is what marks them as unscored -- a
 * win against another person is not a personal best, and a "record" of 1 sitting
 * under a name would be nonsense. Partial rather than a full Record with dummy
 * values, so the absence is the statement.
 */
const HIGHER_IS_BETTER: Partial<Record<MinigameId, boolean>> = {
  "2048": true,
  minesweeper: false,
  snake: true,
  memory: false,
};

export type MinigameScores = Partial<Record<MinigameId, number>>;

const MINIGAME_SCORES_STORAGE_KEY = "ct.minigames.best";

/** Whether this game keeps a personal best at all. */
export function tracksScore(game: MinigameId): boolean {
  return game in HIGHER_IS_BETTER;
}

export function isBetterScore(game: MinigameId, score: number, previous: number): boolean {
  return HIGHER_IS_BETTER[game] ? score > previous : score < previous;
}

/**
 * The stored record, with anything unrecognised dropped.
 *
 * Hand-edited localStorage and a build that renamed a game both arrive here as
 * the same thing: a key that is not a MinigameId, or a value that is not a
 * finite number. Neither may reach a component that renders it.
 */
export function readMinigameScores(): MinigameScores {
  try {
    const raw = localStorage.getItem(MINIGAME_SCORES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const out: MinigameScores = {};
    for (const id of MINIGAME_IDS) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[id] = value;
      }
    }

    return out;
  } catch {
    return {};
  }
}

export function saveMinigameScores(scores: MinigameScores): void {
  try {
    localStorage.setItem(MINIGAME_SCORES_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // A locked-down storage costs the user this record on next launch, not this
    // session -- the value is already in the store either way.
  }
}
