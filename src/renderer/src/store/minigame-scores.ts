/**
 * Personal bests for the games page, and the keys they are filed under.
 *
 * localStorage is the offline copy; the server holds the truth. A run finished
 * with the backend unreachable exists only here until useScoreSync sends it,
 * and a record set on another machine arrives the same way in reverse.
 *
 * The id unions live here rather than in the feature because ui-store holds the
 * selection, and a store importing a feature closes the cycle that
 * scripts/check-architecture.cjs refuses. The feature's difficulty.ts owns the
 * RULES -- board sizes, mine counts, tick rates -- which the store has no use
 * for and must not know.
 */

/**
 * Solo games keep a personal best; the two-player ids are here because the page
 * selection is one list. MultiplayerGameId in @shared/minigames is the same
 * three strings seen from the server's side, and the two unions are joined in
 * the catalogue rather than here -- this file must not import a wire type for a
 * feature it only stores a number for.
 */
export type MinigameId =
  // Solo: these keep a personal best per difficulty.
  | "2048"
  | "minesweeper"
  | "snake"
  | "memory"
  | "sudoku"
  | "puzzle15"
  | "lightsout"
  | "tetris"
  | "simon"
  | "floodit"
  | "nonogram"
  | "typing"
  | "mathsprint"
  | "gunline"
  // Versus: a table on the server, and no record anywhere.
  | "xox"
  | "connect4"
  | "gomoku"
  | "connect5"
  | "connect4trio"
  | "chess"
  | "reversi"
  | "boxes"
  | "blokus"
  | "backgammon"
  | "yahtzee"
  | "ludo"
  | "quiz"
  | "uno"
  | "battleship"
  | "okey"
  | "rummy1"
  | "poker";

/**
 * Sidebar order, and the only place it is decided. Grouped the way the sidebar
 * groups them so the list reads as it is drawn: the solo games first, then the
 * two-player ones, then the ones that seat a crowd.
 */
export const MINIGAME_IDS: readonly MinigameId[] = [
  "2048",
  "minesweeper",
  "snake",
  "memory",
  "sudoku",
  "puzzle15",
  "lightsout",
  "tetris",
  "simon",
  "floodit",
  "nonogram",
  "typing",
  "mathsprint",
  "gunline",
  "xox",
  "connect4",
  "gomoku",
  "connect5",
  "chess",
  "reversi",
  "backgammon",
  "battleship",
  "connect4trio",
  "boxes",
  "blokus",
  "yahtzee",
  "ludo",
  "quiz",
  "uno",
  "okey",
  "rummy1",
  "poker",
];

export const DIFFICULTY_IDS = ["easy", "normal", "hard"] as const;

export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

export function isDifficultyId(value: string): value is DifficultyId {
  return (DIFFICULTY_IDS as readonly string[]).includes(value);
}

/**
 * `normal` is what every game shipped as, and that is not a coincidence: it is
 * what makes the record migration below a rename rather than a reset. Somebody
 * who set a 2048 record before difficulty existed set it on a 4x4 board, and a
 * 4x4 board is exactly what `normal` still is.
 */
export const DEFAULT_DIFFICULTY: DifficultyId = "normal";

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
  sudoku: false,
  puzzle15: false,
  lightsout: false,
  tetris: true,
  simon: true,
  floodit: false,
  nonogram: false,
  typing: true,
  mathsprint: true,
  gunline: true,
};

/**
 * Best score per KEY, where a key is "game:difficulty". A game never played at
 * a difficulty is simply absent.
 */
export type MinigameScores = Record<string, number>;

/** Which difficulty each game is set to. Persisted; the two-player ids are here
 *  because the record covers the selection union, and they simply never move. */
export type MinigameDifficulties = Record<MinigameId, DifficultyId>;

const MINIGAME_SCORES_STORAGE_KEY = "ct.minigames.best";
const MINIGAME_DIFFICULTY_STORAGE_KEY = "ct.minigames.difficulty";

/** Whether this game keeps a personal best at all. */
export function tracksScore(game: MinigameId): boolean {
  return game in HIGHER_IS_BETTER;
}

/**
 * The id a record is filed under: "2048:hard".
 *
 * A composite string rather than a second column, in localStorage and in
 * Postgres alike. The store is a map of numbers keyed by a string and the table
 * is (user_id, game); neither has an opinion about what is in the key, and
 * teaching both to carry a dimension -- so that a 9x9 time is not compared
 * against a 30x16 one -- would be a migration, a query change, and a second
 * place to forget.
 */
export function scoreKey(game: MinigameId, difficulty: DifficultyId): string {
  return `${game}:${difficulty}`;
}

/**
 * The inverse.
 *
 * A key with no valid difficulty suffix is one written before difficulty
 * existed, and every one of those was played on what is now `normal` -- so that
 * is what it reports, rather than discarding a record somebody earned.
 */
export function splitScoreKey(key: string): {
  game: string;
  difficulty: DifficultyId;
} {
  const separator = key.lastIndexOf(":");
  if (separator < 0) {
    return { game: key, difficulty: DEFAULT_DIFFICULTY };
  }

  const suffix = key.slice(separator + 1);
  if (!isDifficultyId(suffix)) {
    return { game: key, difficulty: DEFAULT_DIFFICULTY };
  }

  return { game: key.slice(0, separator), difficulty: suffix };
}

function isScoredKey(key: string): boolean {
  const { game } = splitScoreKey(key);
  return (MINIGAME_IDS as readonly string[]).includes(game)
    && tracksScore(game as MinigameId);
}

/** Compares two scores at the same key, the way that key's game measures. */
export function isBetterScore(key: string, score: number, previous: number): boolean {
  const { game } = splitScoreKey(key);
  return HIGHER_IS_BETTER[game as MinigameId] ? score > previous : score < previous;
}

/**
 * The stored records, with anything unrecognised dropped and anything from
 * before difficulty existed carried forward under its `:normal` key.
 *
 * Hand-edited localStorage, a build that renamed a game, and a build that added
 * difficulty all arrive here as the same thing: a key this version does not
 * recognise. Only the last of those has an answer that is not "drop it".
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
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "number" || !Number.isFinite(value) || !isScoredKey(key)) {
        continue;
      }
      // splitScoreKey resolves a bare "2048" to 2048 + normal, and scoreKey
      // writes it back in the current form. A key that was already composite
      // round-trips unchanged.
      const { game, difficulty } = splitScoreKey(key);
      const migrated = scoreKey(game as MinigameId, difficulty);
      const existing = out[migrated];
      if (existing === undefined || isBetterScore(migrated, value, existing)) {
        out[migrated] = value;
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

/** Every game at its default, then whatever was stored on top. */
export function readMinigameDifficulties(): MinigameDifficulties {
  const out = Object.fromEntries(
    MINIGAME_IDS.map((id) => [id, DEFAULT_DIFFICULTY]),
  ) as MinigameDifficulties;

  try {
    const raw = localStorage.getItem(MINIGAME_DIFFICULTY_STORAGE_KEY);
    if (!raw) {
      return out;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return out;
    }

    for (const id of MINIGAME_IDS) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === "string" && isDifficultyId(value)) {
        out[id] = value;
      }
    }
  } catch {
    // Same call as the scores above: an unreadable store is a default store.
  }

  return out;
}

export function saveMinigameDifficulties(difficulties: MinigameDifficulties): void {
  try {
    localStorage.setItem(
      MINIGAME_DIFFICULTY_STORAGE_KEY,
      JSON.stringify(difficulties),
    );
  } catch {
    // See saveMinigameScores.
  }
}
