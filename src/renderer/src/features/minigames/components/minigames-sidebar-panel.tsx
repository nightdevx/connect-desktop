import { scoreKey } from "@/store/minigame-scores";
import { useUiStore } from "@/store/ui-store";
import { useDisabledGames } from "../use-game-activity";
import { DIFFICULTY_LABELS } from "../difficulty";
import {
  DUEL_MINIGAMES,
  PARTY_MINIGAMES,
  SOLO_MINIGAMES,
  seatsOf,
  type MinigameEntry,
} from "../minigames-catalog";

/**
 * The game list, in three groups.
 *
 * Shaped like SettingsSidebarTabs and the free-games buckets on purpose: this
 * is the third panel in the app whose sidebar is a list of labelled
 * destinations, and three different answers to that would read as three
 * different apps.
 *
 * THREE groups rather than two, because the question people actually arrive
 * with is "what can four of us play" — and a single list of eighteen
 * multiplayer games does not answer it. The split is read off the seat counts
 * rather than typed out, so a game whose table grows moves group on its own.
 *
 * Takes no props. The shell has no interest in which game is on screen, and the
 * room a versus game needs is the board's business, not the list's.
 */
export function MinigamesSidebarPanel() {
  return (
    <div className="ct-minigames-sidebar">
      <MinigameGroup title="Tek kişilik" entries={SOLO_MINIGAMES} />
      <MinigameGroup title="İki kişilik" entries={DUEL_MINIGAMES} />
      <MinigameGroup title="Kalabalık" entries={PARTY_MINIGAMES} />

      <p className="ct-minigames-sidebar-note">
        Rekorlar zorluk başına tutulur — Kolay bir süre, Zor bir sürenin yerine
        geçmez. Çok kişilik oyunlarda rekor tutulmaz.
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
  const disabled = useDisabledGames();

  const visible = entries.filter((entry) => !disabled.includes(entry.id));

  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="ct-minigames-group">
      <h5 className="ct-minigames-group-title">{title}</h5>
      <nav className="ct-minigames-tabs" role="tablist" aria-label={title}>
        {visible.map((entry) => {
          const isActive = selected === entry.id;
          const difficulty = difficulties[entry.id];
          // The record for the difficulty this game is SET to, not for the game.
          // One number covering three boards would be right on one of them and
          // a lie on the other two.
          const best = bestScores[scoreKey(entry.id, difficulty)];
          const seats = seatsOf(entry.id);

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
                <span className="ct-minigames-tab-label">
                  {entry.label}
                  {/* Only where it says something the group title does not: a
                      2-4 game inside "Kalabalık" needs its range, a fixed
                      three-hander needs its number, and a duel needs neither. */}
                  {seats && seats.max > 2 ? (
                    <span className="ct-minigames-tab-seats">
                      {seats.min === seats.max
                        ? `${seats.max} kişi`
                        : `${seats.min}-${seats.max} kişi`}
                    </span>
                  ) : null}
                </span>
                <span className="ct-minigames-tab-description">{entry.description}</span>

                {/* Absent, not zero: a game never played at this difficulty has
                    no record, and "0" is a real score in several of the ones
                    that keep one. */}
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
