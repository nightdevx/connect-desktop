import { Button, Spin } from "antd";
import { EyeOutlined, WifiOutlined } from "@ant-design/icons";
import {
  isTableFinished,
  isTableOpen,
  seatOf,
  spectatorsOf,
  type MinigameTable,
} from "@shared/minigames";
import { useUiStore } from "@/store/ui-store";
import { findMinigame } from "../minigames-catalog";
import { useMultiplayerTables } from "../use-multiplayer-tables";

interface LiveTablesProps {
  currentUserId: string;
}

/**
 * Every two-player table on the server, whichever game the page is showing.
 *
 * The complaint this answers is that the games were invisible unless you were
 * already standing in the right room: a chess table was only listed on the
 * chess page, so somebody playing 2048 had no way of knowing anybody was
 * playing anything. The tables are public — the server broadcasts each one to
 * every signed-in client precisely because it is a lobby, not a private room —
 * so the only thing missing was somewhere to show them.
 *
 * Two buttons, and the difference between them is whether there is a chair
 * free. Katıl sits you down; İzle puts you in the audience, where the board is
 * live and every cell is dead.
 *
 * Lives in the page rail rather than the sidebar because it is content: the
 * rows change while you watch them, and the sidebar is where the app puts
 * things that do not.
 */
export function LiveTables({ currentUserId }: LiveTablesProps) {
  // null: this instance draws no board, so it wants the whole registry rather
  // than one game's slice of it.
  const { allTables, isLoading, isBusy, join, watch } = useMultiplayerTables(
    null,
    currentUserId,
  );

  const selectGame = useUiStore((state) => state.setSelectedMinigame);
  const watchedTableId = useUiStore((state) => state.watchedTableId);

  // The order the page cares about: a game being played beats one waiting for a
  // second player, and a finished board beats neither. Within a bucket the
  // registry order stands, which is newest first.
  const tables = [...allTables].sort(
    (left, right) => rankOf(left) - rankOf(right),
  );

  const openTable = (table: MinigameTable, mode: "join" | "watch") => {
    // The game FIRST: selecting it clears the watched id, so setting one before
    // it would be thrown away by the very next line. Also what makes İzle a
    // navigation — the board that appears is the one being watched.
    selectGame(table.game);
    if (mode === "join") {
      join(table.id);
    } else {
      watch(table.id);
    }
  };

  return (
    <section className="ct-live-tables" aria-label="Canlı masalar">
      <header className="ct-live-tables-head">
        <h5>
          <WifiOutlined aria-hidden="true" /> Canlı Masalar
        </h5>
        <span className="ct-live-tables-count">{tables.length}</span>
      </header>

      {isLoading ? (
        <div className="ct-live-tables-empty">
          <Spin size="small" />
        </div>
      ) : tables.length === 0 ? (
        <p className="ct-live-tables-empty">
          Şu anda açık masa yok. Çok kişilik bir oyun seçip masa açarsan herkesin
          listesinde görünür.
        </p>
      ) : (
        <ul className="ct-live-tables-list">
          {tables.map((table) => {
            const entry = findMinigame(table.game);
            const isMine = seatOf(table, currentUserId) >= 0;
            // "Full" is not "two people": a table that seats four is full at four,
            // and any started table is closed whatever its seat count says.
            const isFull = !isTableOpen(table);
            const isWatched = table.id === watchedTableId;

            return (
              <li
                key={table.id}
                className="ct-live-table"
                data-mine={isMine ? "true" : undefined}
                data-watched={isWatched ? "true" : undefined}
              >
                <span className="ct-live-table-game">
                  <span className="ct-live-table-icon" aria-hidden="true">
                    {entry.icon}
                  </span>
                  {entry.label}
                  <span className="ct-live-table-state" data-state={stateOf(table)}>
                    {STATE_LABELS[stateOf(table)]}
                  </span>
                  {spectatorsOf(table).length > 0 ? (
                    <span
                      className="ct-live-table-audience"
                      title={spectatorsOf(table)
                        .map((watcher) => watcher.username)
                        .join(", ")}
                    >
                      <EyeOutlined aria-hidden="true" />
                      {spectatorsOf(table).length}
                    </span>
                  ) : null}
                </span>

                <span className="ct-live-table-players">
                  {table.players.map((player, seat) => (
                    <span key={player.userId} className="ct-live-table-player">
                      <span
                        className="ct-versus-mark"
                        data-seat={seat}
                        aria-hidden="true"
                      />
                      <span className="ct-live-table-name">
                        {player.username}
                        {player.userId === currentUserId ? " (sen)" : ""}
                      </span>
                    </span>
                  ))}
                </span>

                {/* Your own table is a link back to it, not an invitation to
                    join a chair you are already in. */}
                {isMine ? (
                  <Button
                    size="small"
                    type="text"
                    block
                    onClick={() => selectGame(table.game)}
                  >
                    Masana dön
                  </Button>
                ) : isFull ? (
                  <Button
                    size="small"
                    block
                    type={isWatched ? "primary" : "default"}
                    icon={<EyeOutlined />}
                    onClick={() => openTable(table, "watch")}
                  >
                    {isWatched ? "İzleniyor" : "İzle"}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    block
                    type="primary"
                    disabled={isBusy}
                    onClick={() => openTable(table, "join")}
                  >
                    Katıl
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type TableState = "playing" | "waiting" | "finished";

const STATE_LABELS: Record<TableState, string> = {
  playing: "oynanıyor",
  waiting: "bekliyor",
  finished: "bitti",
};

function stateOf(table: MinigameTable): TableState {
  if (isTableFinished(table)) {
    return "finished";
  }
  // Started, not "two people are here". A four-handed table with three
  // players is still waiting for somebody to press Baslat.
  return table.started ? "playing" : "waiting";
}

const RANK: Record<TableState, number> = { playing: 0, waiting: 1, finished: 2 };

function rankOf(table: MinigameTable): number {
  return RANK[stateOf(table)];
}
