import { useState, type CSSProperties } from "react";
import { DIFFICULTY_IDS, scoreKey } from "@/store/minigame-scores";
import { useUiStore } from "@/store/ui-store";
import { DIFFICULTY_LABELS } from "../difficulty";
import {
  DUEL_MINIGAMES,
  MINIGAMES,
  PARTY_MINIGAMES,
  SOLO_MINIGAMES,
  seatsOf,
  type MinigameEntry,
} from "../minigames-catalog";
import { gameTone, showMinigame } from "../minigames-view";
import { useDisabledGames } from "../use-game-activity";
import { LiveTables } from "./live-tables";

const FILTERS = [
  { id: "all", label: "Tümü", entries: MINIGAMES },
  { id: "solo", label: "Tek kişilik", entries: SOLO_MINIGAMES },
  { id: "duel", label: "İki kişilik", entries: DUEL_MINIGAMES },
  { id: "party", label: "Kalabalık", entries: PARTY_MINIGAMES },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/**
 * The Odak Oyunlar page's first half: every game as a card, the tables that are
 * live right now, and your records (OdakOyunlar.dc.html).
 *
 * Reads what the sidebar reads and picks a game the way the sidebar does; the
 * only thing of its own is which kind of game the grid is narrowed to.
 */
export function MinigamesHome({ currentUserId }: { currentUserId: string }) {
  const select = useUiStore((state) => state.setSelectedMinigame);
  const bestScores = useUiStore((state) => state.minigameBestScores);
  const difficulties = useUiStore((state) => state.minigameDifficulty);
  const disabled = useDisabledGames();
  const [filter, setFilter] = useState<FilterId>("all");
  // The cards rise in one after another when the page opens; a later filter
  // change only fades the new grid in.
  const [filtered, setFiltered] = useState(false);

  const filterIndex = FILTERS.findIndex((entry) => entry.id === filter);
  const games = FILTERS[filterIndex].entries.filter((entry) => !disabled.includes(entry.id));

  const play = (entry: MinigameEntry) => {
    select(entry.id);
    showMinigame();
  };

  const records = SOLO_MINIGAMES.flatMap((entry) =>
    DIFFICULTY_IDS.flatMap((difficulty) => {
      const score = bestScores[scoreKey(entry.id, difficulty)];
      return score !== undefined && entry.formatScore
        ? [{ entry, difficulty, score: entry.formatScore(score) }]
        : [];
    }),
  );

  return (
    <div className="ct-minigames-home">
      <header className="ct-minigames-home-head">
        <div className="ct-odak-pill">
          <h1>Oyunlar</h1>
        </div>
        <div
          className="ct-minigames-filter"
          role="tablist"
          aria-label="Oyun türü"
          style={{ "--i": filterIndex, "--n": FILTERS.length } as CSSProperties}
        >
          <span className="ct-minigames-filter-thumb" aria-hidden="true" />
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === filter}
              onClick={() => {
                setFilter(entry.id);
                setFiltered(true);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div className="ct-minigames-home-body">
        <section
          key={filter}
          className="ct-minigames-home-grid"
          aria-label="Oyun listesi"
          data-intro={filtered ? undefined : ""}
        >
          {games.map((entry, index) => {
            const difficulty = difficulties[entry.id];
            const best = bestScores[scoreKey(entry.id, difficulty)];
            const seats = seatsOf(entry.id);
            const meta =
              best !== undefined && entry.formatScore
                ? `Rekorun: ${entry.formatScore(best)} · ${DIFFICULTY_LABELS[difficulty]}`
                : seats
                  ? seats.min === seats.max
                    ? `${seats.max} kişi`
                    : `${seats.min}–${seats.max} kişi`
                  : entry.description;

            return (
              <article
                key={entry.id}
                className="ct-minigames-card"
                style={{ "--i": index } as CSSProperties}
              >
                <div
                  className="ct-minigames-card-cover"
                  data-game-tone={gameTone(entry.id)}
                  aria-hidden="true"
                >
                  <span className="ct-minigames-card-art">{entry.icon}</span>
                </div>
                <div>
                  <h2 className="ct-minigames-card-name">{entry.label}</h2>
                  <p className="ct-minigames-card-meta" title={entry.description}>
                    {meta}
                  </p>
                </div>
                <button
                  type="button"
                  className="ct-minigames-card-play"
                  aria-label={`${entry.label} oyna`}
                  onClick={() => play(entry)}
                >
                  Oyna
                </button>
              </article>
            );
          })}
        </section>

        <aside className="ct-minigames-home-side" aria-label="Masalar ve rekorlar">
          <LiveTables currentUserId={currentUserId} />

          <h2 className="ct-odak-side-title spaced">REKORLARIN</h2>
          <article className="ct-odak-card ct-minigames-records">
            {records.length === 0 ? (
              <p className="ct-minigames-records-empty">
                Henüz rekorun yok. Tek kişilik bir oyunu bitirdiğinde burada görünür.
              </p>
            ) : (
              records.map(({ entry, difficulty, score }) => (
                <div key={`${entry.id}:${difficulty}`} className="ct-minigames-record">
                  <span>
                    {entry.label}{" "}
                    <span className="ct-minigames-record-level">
                      · {DIFFICULTY_LABELS[difficulty]}
                    </span>
                  </span>
                  <span className="ct-minigames-record-score">{score}</span>
                </div>
              ))
            )}
          </article>
        </aside>
      </div>
    </div>
  );
}
