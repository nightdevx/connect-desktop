import { useUiStore } from "@/store/ui-store";
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
        Tek kişilik oyunlar çevrimdışı çalışır ve rekorları yalnızca bu bilgisayarda
        tutulur. İki kişiliklerin kendi masaları vardır — masa aç, listede görünsün,
        biri katılsın. Sesli odaya gerek yok.
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

  return (
    <section className="ct-minigames-group">
      <h5 className="ct-minigames-group-title">{title}</h5>
      <nav className="ct-minigames-tabs" role="tablist" aria-label={title}>
        {entries.map((entry) => {
          const isActive = selected === entry.id;
          const best = bestScores[entry.id];

          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ct-minigames-tab ${isActive ? "active" : ""}`}
              onClick={() => select(entry.id)}
            >
              <span className="ct-minigames-tab-head">
                <span className="ct-minigames-tab-label">
                  <span className="ct-minigames-tab-icon" aria-hidden="true">
                    {entry.icon}
                  </span>
                  {entry.label}
                </span>
              </span>
              <span className="ct-minigames-tab-description">{entry.description}</span>
              {/* Absent, not zero: a game never played has no record, and "0" is
                  a real score in three of the four that keep one. */}
              {best !== undefined && entry.formatScore ? (
                <span className="ct-minigames-tab-best">
                  Rekor: {entry.formatScore(best)}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
