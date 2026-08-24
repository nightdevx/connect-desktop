import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { MinigameTable, MultiplayerGameId } from "@shared/minigames";
import { multiplayerService } from "./multiplayer-service";

export type GameActivityRole = "playing" | "watching";

export interface GameActivity {
  game: MultiplayerGameId;
  tableId: string;
  role: GameActivityRole;
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
      for (const player of table.players) {
        byUser.set(player.userId, {
          game: table.game,
          tableId: table.id,
          role: "playing",
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
        });
      }
    }
    return byUser;
  }, [tables]);
}
