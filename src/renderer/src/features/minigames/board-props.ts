import type { DifficultyId } from "@/store/minigame-scores";

/**
 * What every board is handed, whether or not it uses it.
 *
 * Its own module rather than a corner of minigames-catalog.tsx, because the
 * catalogue imports the boards and the boards need this type: declared there,
 * the two import each other and scripts/check-architecture.cjs refuses the
 * cycle. A type both sides depend on belongs below both of them.
 *
 * A solo game ignores currentUserId and a versus game ignores difficulty. The
 * alternative was two registries -- one typed `ComponentType<SoloProps>` and
 * one `ComponentType<VersusProps>` -- and two of everything that reads them, to
 * save one unused parameter in each of seven components.
 */
export interface MinigameBoardProps {
  /** Only the versus games read it. */
  currentUserId: string;
  /** Only the solo games read it; the difficulty of chess is your opponent. */
  difficulty: DifficultyId;
}
