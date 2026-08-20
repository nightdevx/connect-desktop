import { scoreKey } from "@/store/minigame-scores";
import { useUiStore } from "@/store/ui-store";
import { DIFFICULTY_LABELS } from "../difficulty";
import {
  SOLO_MINIGAMES,
  VERSUS_MINIGAMES,
  type MinigameEntry,
} from "../minigames-catalog";

/**
 * The game list, in two groups.
 *
 * Shaped like SettingsSidebarTabs and the free-games buckets on purpose: this
 * is the third panel in the app whose sidebar is a list of labelled
 * destinations, and three different answers to that would read as three
 * different apps.
 *
 * Takes no props. The shell has no interest in which game is on screen, and the
 * room a versus game needs is the board's business, not the list's.
 */
export function MinigamesSidebarPanel() {
  return (
    <div className="ct-minigames-sidebar">
      <MinigameGroup title="Tek kişilik" entries={SOLO_MINIGAMES} />
      <MinigameGroup title="İki kişilik" entries={VERSUS_MINIGAMES} />

      <p className="ct-minigames-sidebar-note">
        Rekorlar zorluk başına tutulur — Kolay bir süre, Zor bir sürenin yerine
        geçmez.
      </p>
    </div>
  );
}

function MinigameGroup({
  title,
  entries,
}: {
  title: string;
  entries: readonly MinigameEntry[];
}) {
  const selected = useUiStore((state) => state.selectedMinigame);
  const select = useUiStore((state) => state.setSelectedMinigame);
  const bestScores = useUiStore((state) => state.minigameBestScores);
  const difficulties = useUiStore((state) => state.minigameDifficulty);

  return (
    <section className="ct-minigames-group">
      <h5 className="ct-minigames-group-title">{title}</h5>
      <nav className="ct-minigames-tabs" role="tablist" aria-label={title}>
        {entries.map((entry) => {
          const isActive = selected === entry.id;
          const difficulty = difficulties[entry.id];
          // The record for the difficulty this game is SET to, not for the game.
          // One number covering three boards would be right on one of them and
          // a lie on the other two.
          const best = bestScores[scoreKey(entry.id, difficulty)];

          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ct-minigames-tab ${isActive ? "active" : ""}`}
              onClick={() => select(entry.id)}
            >
              <span className="ct-minigames-tab-icon" aria-hidden="true">
                {entry.icon}
              </span>

              <span className="ct-minigames-tab-body">
                <span className="ct-minigames-tab-label">{entry.label}</span>
                <span className="ct-minigames-tab-description">{entry.description}</span>

                {/* Absent, not zero: a game never played at this difficulty has
                    no record, and "0" is a real score in three of the four that
                    keep one. */}
                {best !== undefined && entry.formatScore ? (
                  <span className="ct-minigames-tab-best">
                    <span className="ct-minigames-tab-best-scope">
                      {DIFFICULTY_LABELS[difficulty]}
                    </span>
                    {entry.formatScore(best)}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
