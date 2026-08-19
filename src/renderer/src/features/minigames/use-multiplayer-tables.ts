import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toErrorMessage } from "@shared/error-message";
import { seatOf, type MinigameTable, type MultiplayerGameId } from "@shared/minigames";
import { multiplayerService } from "./multiplayer-service";

export interface MultiplayerTablesController {
  /** The table this account is seated at, or null. */
  myTable: MinigameTable | null;
  /** Everyone else's tables for this game, newest first. */
  otherTables: MinigameTable[];
  /** True until the first read of the registry resolves. */
  isLoading: boolean;
  /** True while an action is in flight, so a board can refuse a double click. */
  isBusy: boolean;
  error: string | null;
  dismissError: () => void;
  open: () => void;
  join: (tableId: string) => void;
  /** A grid game's move: the cell that was clicked. */
  move: (cell: number) => void;
  /** Chess: the move in UCI, taken straight from the server's legal-move list. */
  chessMove: (uci: string) => void;
  restart: () => void;
  leave: () => void;
}

/**
 * The table browser and the board behind it, for one game.
 *
 * No react-query. There is one collection, the server pushes every change to
 * it, and nothing else in the app reads it — so a cache would be a subscription
 * wearing a cache's clothes, with an invalidation story for events that arrive
 * pre-invalidated.
 *
 * The registry is kept as a Map because the socket sends ONE table per frame.
 * Rebuilding a list from a full snapshot on every move would put the whole
 * registry on the wire once per click; this way a frame is one table and the
 * list is derived.
 */
export function useMultiplayerTables(
  game: MultiplayerGameId,
  currentUserId: string,
): MultiplayerTablesController {
  const [tables, setTables] = useState<Map<string, MinigameTable>>(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTable = useCallback((tableId: string, table: MinigameTable | null) => {
    setTables((current) => {
      const next = new Map(current);
      if (table) {
        next.set(table.id, table);
      } else {
        next.delete(tableId);
      }
      return next;
    });
  }, []);

  // The starting point. Everything after this arrives on the socket.
  //
  // Not keyed on `game`: the registry holds every game's tables and the split
  // below is a filter, so switching games must not throw away a list that is
  // already correct and re-read it.
  useEffect(() => {
    let cancelled = false;

    void multiplayerService.listTables().then((result) => {
      if (cancelled) {
        return;
      }
      setIsLoading(false);
      if (!result.ok) {
        setError(toErrorMessage(result.error, "Masalar okunamadı."));
        return;
      }
      // `ok` does not narrow `data` — DesktopResult is a struct with two
      // optional fields, not a discriminated union.
      const listed = result.data?.tables ?? [];
      setTables(new Map(listed.map((table) => [table.id, table])));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return multiplayerService.onLobbyStreamEvent((event) => {
      if (event.type !== "minigame-table") {
        return;
      }
      applyTable(event.tableId, event.table);
    });
  }, [applyTable]);

  const { myTable, otherTables } = useMemo(() => {
    const all = [...tables.values()];
    // Across EVERY game, not just this one: an account can only be seated at a
    // single table, and finding it under the game the page is not showing is
    // what lets the page say so instead of silently offering to open a second.
    const mine = all.find((table) => seatOf(table, currentUserId) >= 0) ?? null;

    const others = all
      .filter((table) => table.game === game && table.id !== mine?.id)
      // Newest first: a table that has just been opened is the one somebody is
      // sitting at waiting, and the one worth joining.
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return { myTable: mine, otherTables: others };
  }, [tables, game, currentUserId]);

  // Read inside the action callbacks so they do not have to be rebuilt — and so
  // a click cannot act on the table that was on screen two renders ago.
  const myTableRef = useRef<MinigameTable | null>(null);
  useEffect(() => {
    myTableRef.current = myTable;
  }, [myTable]);

  const run = useCallback(
    (action: () => Promise<Awaited<ReturnType<typeof multiplayerService.leave>>>) => {
      setIsBusy(true);
      setError(null);

      void action()
        .then((result) => {
          if (!result.ok) {
            // The server's own message. It knows why — not your turn, cell
            // taken, table full — and inventing a generic one here would throw
            // that away.
            setError(toErrorMessage(result.error, "İşlem tamamlanamadı."));
            return;
          }
          // Applied straight from the reply rather than waiting for this
          // client's own broadcast to come back round. The socket frame is what
          // everyone ELSE is waiting for.
          const table = result.data?.table;
          if (table) {
            applyTable(table.id, table);
          }
        })
        .finally(() => setIsBusy(false));
    },
    [applyTable],
  );

  const open = useCallback(() => run(() => multiplayerService.open(game)), [run, game]);

  const join = useCallback(
    (tableId: string) => run(() => multiplayerService.join(tableId)),
    [run],
  );

  const withMyTable = useCallback(
    (action: (tableId: string) => Promise<Awaited<ReturnType<typeof multiplayerService.leave>>>) => {
      const current = myTableRef.current;
      if (!current) {
        return;
      }
      // The table id travels with every action. Without it a click already in
      // flight when the table was dropped lands on whatever replaced it.
      run(() => action(current.id));
    },
    [run],
  );

  const move = useCallback(
    (cell: number) => withMyTable((tableId) => multiplayerService.move(tableId, cell)),
    [withMyTable],
  );

  const chessMove = useCallback(
    (uci: string) => withMyTable((tableId) => multiplayerService.chessMove(tableId, uci)),
    [withMyTable],
  );

  const restart = useCallback(
    () => withMyTable((tableId) => multiplayerService.restart(tableId)),
    [withMyTable],
  );

  const leave = useCallback(() => run(() => multiplayerService.leave()), [run]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    myTable,
    otherTables,
    isLoading,
    isBusy,
    error,
    dismissError,
    open,
    join,
    move,
    chessMove,
    restart,
    leave,
  };
}
