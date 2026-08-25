import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { isTableOpen, type MinigameTable, type MultiplayerGameId } from "@shared/minigames";
import { multiplayerService } from "./multiplayer-service";

export type GameActivityRole = "playing" | "watching";

export interface GameActivity {
  game: MultiplayerGameId;
  tableId: string;
  role: GameActivityRole;
  /**
   * Whether a stranger could still sit down here: a free chair at a table that
   * has not been dealt. Read from the same snapshot the rest of this store
   * holds, so a card offering to join is offering something that was true a
   * frame ago rather than something it guessed from a game id.
   */
  joinable: boolean;
}

interface GameActivityState {
  tables: Map<string, MinigameTable>;
  disabledGames: string[];
  ready: boolean;
  applyTable: (tableId: string, table: MinigameTable | null) => void;
  reset: (tables: MinigameTable[], disabledGames: string[]) => void;
}

const useGameActivityStore = create<GameActivityState>((set) => ({
  tables: new Map(),
  disabledGames: [],
  ready: false,
  applyTable: (tableId, table) =>
    set((state) => {
      const next = new Map(state.tables);
      if (table) {
        next.set(table.id, table);
      } else {
        next.delete(tableId);
      }
      return { tables: next };
    }),
  reset: (tables, disabledGames) =>
    set({
      tables: new Map(tables.map((table) => [table.id, table])),
      disabledGames,
      ready: true,
    }),
}));

export function useGameActivitySync(enabled: boolean): void {
  const applyTable = useGameActivityStore((state) => state.applyTable);
  const reset = useGameActivityStore((state) => state.reset);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    void multiplayerService.listTables().then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      reset(result.data?.tables ?? [], result.data?.disabledGames ?? []);
    });

    const unsubscribe = multiplayerService.onLobbyStreamEvent((event) => {
      if (event.type !== "minigame-table") {
        return;
      }
      applyTable(event.tableId, event.table);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, applyTable, reset]);
}

export function useDisabledGames(): string[] {
  return useGameActivityStore((state) => state.disabledGames);
}

export function useGameActivityByUser(): Map<string, GameActivity> {
  const tables = useGameActivityStore((state) => state.tables);

  return useMemo(() => {
    const byUser = new Map<string, GameActivity>();
    for (const table of tables.values()) {
      const joinable = isTableOpen(table);

      for (const player of table.players) {
        // A seat somebody has walked out of is not where that person is.
        if (player.left) {
          continue;
        }
        byUser.set(player.userId, {
          game: table.game,
          tableId: table.id,
          role: "playing",
          joinable,
        });
      }
      for (const watcher of table.spectators ?? []) {
        if (byUser.has(watcher.userId)) {
          continue;
        }
        byUser.set(watcher.userId, {
          game: table.game,
          tableId: table.id,
          role: "watching",
          joinable,
        });
      }
    }
    return byUser;
  }, [tables]);
}

/**
 * Sits down at a table somebody else is at.
 *
 * Here rather than in multiplayer-service because this is what the workspace
 * needs, and the workspace reaches this feature through its index.ts: exporting
 * the whole bridge would make every caller's import a promise about the eleven
 * other things on it.
 */
export async function joinMinigameTable(tableId: string): Promise<boolean> {
  const result = await multiplayerService.join(tableId);
  return result.ok;
}
