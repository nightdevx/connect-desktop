import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toErrorMessage } from "@shared/error-message";
import { seatOf, type MinigameTable, type MultiplayerGameId } from "@shared/minigames";
import { useUiStore } from "@/store/ui-store";
import { multiplayerService } from "./multiplayer-service";

export interface MultiplayerTablesController {
  /** The table this account is seated at, or null. */
  myTable: MinigameTable | null;
  /** Everyone else's tables for this game, newest first. */
  otherTables: MinigameTable[];
  /**
   * Every table on the server, for every game, newest first — including this
   * account's own. What the "Canlı Masalar" rail lists.
   */
  allTables: MinigameTable[];
  /**
   * The table being watched from the audience, or null. Never a table this
   * account is seated at: sitting down is playing, not watching.
   */
  watching: MinigameTable | null;
  /** Watch somebody else's table. Only meaningful for the selected game. */
  watch: (tableId: string) => void;
  stopWatching: () => void;
  /** True until the first read of the registry resolves. */
  isLoading: boolean;
  /** True while an action is in flight, so a board can refuse a double click. */
  isBusy: boolean;
  error: string | null;
  dismissError: () => void;
  open: () => void;
  join: (tableId: string) => void;
  /** A grid game`s move: the cell that was clicked. */
  move: (cell: number) => void;
  /**
   * Everything else: a verb and its colon-separated arguments. Chess sends its
   * UCI through here too, taken straight from the server`s own legal-move list.
   */
  sendMove: (move: string) => void;
  /** Begins a game at a table that is not full. */
  start: () => void;
  /**
   * The host shaping the table before it is dealt. Anything left out is left
   * alone, so setting the seat count does not reset a hand size somebody chose.
   */
  configure: (settings: { handSize?: number; maxSeats?: number }) => void;
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
 *
 * `game` is nullable so the live-tables rail can hold the same registry without
 * pretending to be a board: with null there is no board, `otherTables` is
 * empty, and only `allTables` is interesting.
 *
 * ponytail: the rail and the board each mount one of these, so the page holds
 * two registries fed by the same socket. That is one extra GET on mount and one
 * extra listener on an IPC channel that is already open — cheaper than a shared
 * store with its own subscription bookkeeping. Upgrade if a third reader
 * appears.
 */
export function useMultiplayerTables(
  game: MultiplayerGameId | null,
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

  const { myTable, otherTables, allTables } = useMemo(() => {
    // Newest first: a table that has just been opened is the one somebody is
    // sitting at waiting, and the one worth joining.
    const all = [...tables.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    // Across EVERY game, not just this one: an account can only be seated at a
    // single table, and finding it under the game the page is not showing is
    // what lets the page say so instead of silently offering to open a second.
    const mine = all.find((table) => seatOf(table, currentUserId) >= 0) ?? null;

    const others = all.filter(
      (table) => table.game === game && table.id !== mine?.id,
    );

    return { myTable: mine, otherTables: others, allTables: all };
  }, [tables, game, currentUserId]);

  // The audience seat, and the only place it is decided. Read off the store so
  // the rail's İzle button and the board agree without a prop between them.
  const watchedTableId = useUiStore((state) => state.watchedTableId);
  const setWatchedTable = useUiStore((state) => state.setWatchedTable);

  const watching = useMemo(() => {
    if (!watchedTableId) {
      return null;
    }
    const table = tables.get(watchedTableId);
    // Seated at it means playing it, and a player is not in the audience. This
    // is what makes joining the table you were watching a clean handover.
    if (!table || seatOf(table, currentUserId) >= 0) {
      return null;
    }
    return table;
  }, [tables, watchedTableId, currentUserId]);

  // A watched table is somebody else's, so it can end and be reaped while it is
  // on screen. Clearing the id rather than leaving it dangling is what stops the
  // rail from painting a row as "İzleniyor" forever.
  useEffect(() => {
    if (watchedTableId && !isLoading && !tables.has(watchedTableId)) {
      setWatchedTable(null);
    }
  }, [watchedTableId, tables, isLoading, setWatchedTable]);

  // The audience is server-side now, and this is the ONE place the local id is
  // pushed to it. Only the rail instance (`game === null`) does it: the page
  // mounts two registries off the same socket, and both syncing would send every
  // watch twice.
  const ownsWatchSync = game === null;
  useEffect(() => {
    if (!ownsWatchSync) {
      return;
    }
    if (watchedTableId) {
      void multiplayerService.watch(watchedTableId);
    } else {
      void multiplayerService.unwatch();
    }
  }, [ownsWatchSync, watchedTableId]);

  // Leaving the page is leaving the audience. Without this the server keeps
  // listing a spectator who closed the tab until the table itself is reaped.
  useEffect(() => {
    if (!ownsWatchSync) {
      return;
    }
    return () => {
      void multiplayerService.unwatch();
    };
  }, [ownsWatchSync]);

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

  // Taking a seat ends the watching, whichever way it is taken. Left set, the
  // board would draw the audience view of a table the user is now playing at.
  const open = useCallback(() => {
    if (!game) {
      return;
    }
    setWatchedTable(null);
    run(() => multiplayerService.open(game));
  }, [run, game, setWatchedTable]);

  const join = useCallback(
    (tableId: string) => {
      setWatchedTable(null);
      run(() => multiplayerService.join(tableId));
    },
    [run, setWatchedTable],
  );

  const watch = useCallback(
    (tableId: string) => setWatchedTable(tableId),
    [setWatchedTable],
  );

  const stopWatching = useCallback(() => setWatchedTable(null), [setWatchedTable]);

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

  const sendMove = useCallback(
    (move: string) => withMyTable((tableId) => multiplayerService.sendMove(tableId, move)),
    [withMyTable],
  );

  const start = useCallback(
    () => withMyTable((tableId) => multiplayerService.start(tableId)),
    [withMyTable],
  );

  const configure = useCallback(
    (settings: { handSize?: number; maxSeats?: number }) =>
      withMyTable((tableId) => multiplayerService.configure(tableId, settings)),
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
    allTables,
    watching,
    watch,
    stopWatching,
    isLoading,
    isBusy,
    error,
    dismissError,
    open,
    join,
    start,
    configure,
    move,
    sendMove,
    restart,
    leave,
  };
}
