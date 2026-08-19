import { useState } from "react";
import { Alert, Button, Spin } from "antd";
import {
  isTableFinished,
  seatOf,
  type MinigameGridBoard,
  type MinigameTable,
  type MultiplayerGameId,
} from "@shared/minigames";
import { ChessBoardView } from "./chess-board-view";
import { useMultiplayerTables } from "../../use-multiplayer-tables";

interface VersusBoardProps {
  game: MultiplayerGameId;
  currentUserId: string;
}

/**
 * The table browser and one board, for both two-player games.
 *
 * A table is its own lobby: open one and it appears in everybody's list, join
 * one and you are playing. No voice room is involved and none is required.
 *
 * It implements no rules. Whose turn it is, whether a cell is free, who won and
 * which cells made the line all arrive inside the table — the server decides
 * every one of them, and a second opinion here is a second thing to get wrong.
 * What is local is presentation only: which column the cursor is over, and
 * which seat gets which colour.
 *
 * A grid game and chess share the seats, the result line and the rematch
 * button; only the board differs, so only the board is branched on.
 */
export function VersusBoard({ game, currentUserId }: VersusBoardProps) {
  const {
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
  } = useMultiplayerTables(game, currentUserId);

  if (isLoading) {
    return (
      <div className="ct-minigame-state">
        <Spin />
        <p>Masalar okunuyor…</p>
      </div>
    );
  }

  const errorBanner = error ? (
    <Alert
      type="error"
      showIcon
      closable
      onClose={dismissError}
      message={error}
      className="ct-alert"
    />
  ) : null;

  // Seated somewhere else — including at a table for the OTHER game. An account
  // holds one seat at a time, so saying which is more useful than offering a
  // second table the server would refuse to give.
  if (myTable && myTable.game !== game) {
    return (
      <div className="ct-minigame">
        {errorBanner}
        <div className="ct-minigame-state">
          <p>Başka bir masadasın.</p>
          <p className="ct-minigame-state-hint">
            Aynı anda tek masada oturabilirsin. Buradan oynamak için önce o masadan
            kalk.
          </p>
          <Button danger onClick={leave} loading={isBusy}>
            Masadan kalk
          </Button>
        </div>
      </div>
    );
  }

  if (!myTable) {
    return (
      <div className="ct-minigame">
        {errorBanner}
        <TableBrowser
          tables={otherTables}
          isBusy={isBusy}
          onOpen={open}
          onJoin={join}
        />
      </div>
    );
  }

  return (
    <div className="ct-minigame">
      {errorBanner}
      <Board
        table={myTable}
        currentUserId={currentUserId}
        isBusy={isBusy}
        onCellMove={move}
        onChessMove={chessMove}
        onRestart={restart}
        onLeave={leave}
      />
    </div>
  );
}

function TableBrowser({
  tables,
  isBusy,
  onOpen,
  onJoin,
}: {
  tables: readonly MinigameTable[];
  isBusy: boolean;
  onOpen: () => void;
  onJoin: (tableId: string) => void;
}) {
  return (
    <div className="ct-versus-browser">
      <div className="ct-versus-browser-head">
        <span className="ct-versus-browser-count">
          {tables.length > 0 ? `${tables.length} masa` : "Açık masa yok"}
        </span>
        <Button type="primary" onClick={onOpen} loading={isBusy}>
          Masa aç
        </Button>
      </div>

      {tables.length === 0 ? (
        <div className="ct-minigame-state">
          <p>Şu anda kimse beklemiyor.</p>
          <p className="ct-minigame-state-hint">
            Masa aç — açtığın masa herkesin listesinde görünür ve biri oturunca oyun
            başlar.
          </p>
        </div>
      ) : (
        <ul className="ct-versus-table-list">
          {tables.map((table) => {
            const host = table.players[0];
            const isFull = table.players.length >= 2;

            return (
              <li key={table.id} className="ct-versus-table-row">
                <span className="ct-versus-table-host">
                  <span className="ct-versus-mark" data-seat={0} aria-hidden="true" />
                  {host?.username ?? "Bilinmeyen"}
                </span>
                <span className="ct-versus-table-state">
                  {isFull ? `${table.players[1].username} ile oynuyor` : "Rakip bekliyor"}
                </span>
                {/* A full table is listed rather than hidden: seeing that the
                    game is being played is the answer to "is anyone here", and
                    a list that empties itself reads as broken. */}
                <Button
                  size="small"
                  type="primary"
                  disabled={isFull || isBusy}
                  onClick={() => onJoin(table.id)}
                >
                  {isFull ? "Dolu" : "Katıl"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The seats, one board and the buttons.
 *
 * Everything except the board itself is identical across the games, which is
 * why the split is here and not one level up: a new game brings a board and
 * inherits the turn indicator, the result line and the rematch button.
 */
function Board({
  table,
  currentUserId,
  isBusy,
  onCellMove,
  onChessMove,
  onRestart,
  onLeave,
}: {
  table: MinigameTable;
  currentUserId: string;
  isBusy: boolean;
  onCellMove: (cell: number) => void;
  onChessMove: (uci: string) => void;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const mySeat = seatOf(table, currentUserId);
  const isFinished = isTableFinished(table);
  const isWaiting = table.players.length < 2;
  const isMyTurn = !isFinished && !isWaiting && table.turn === mySeat;

  return (
    <>
      <div className="ct-versus-seats">
        {table.players.map((player, seat) => (
          <span
            key={player.userId}
            className="ct-versus-seat"
            data-seat={seat}
            // Only while the game is live: leaving it on after a win would
            // pulse the loser's name if they happened to be next in turn.
            data-active={!isFinished && !isWaiting && table.turn === seat ? "true" : undefined}
          >
            <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
            {player.username}
            {player.userId === currentUserId ? " (sen)" : ""}
            {/* Seat 0 is white by definition, so the seat colour already says
                this — spelling it out saves the player working it out from a
                swatch they have not learnt yet. */}
            {table.chess ? (seat === 0 ? " · beyaz" : " · siyah") : ""}
          </span>
        ))}
        {isWaiting ? (
          <span className="ct-versus-seat ct-versus-seat-empty">Rakip bekleniyor…</span>
        ) : null}
      </div>

      {table.grid ? (
        <GridBoardView
          board={table.grid}
          game={table.game}
          isMyTurn={isMyTurn}
          isBusy={isBusy}
          onMove={onCellMove}
        />
      ) : null}

      {table.chess ? (
        <ChessBoardView
          board={table.chess}
          mySeat={mySeat}
          isMyTurn={isMyTurn}
          isBusy={isBusy}
          onMove={onChessMove}
        />
      ) : null}

      <p className="ct-minigame-hint">
        {isFinished
          ? // Chess says HOW it ended — stalemate and insufficient material are
            // both draws, and "Berabere." alone leaves the players arguing.
            `${resultText(table, mySeat)}${table.chess?.outcome ? ` ${table.chess.outcome}.` : ""}`
          : isWaiting
            ? "Masan listede görünüyor. Biri oturunca oyun başlar."
            : isMyTurn
              ? "Sıra sende."
              : "Rakibin oynuyor."}
      </p>

      <div className="ct-versus-actions">
        {/* Only once there is somebody to have a rematch with. On an empty
            table it would deal a fresh board nobody has played on. */}
        {!isWaiting ? (
          <Button onClick={onRestart} loading={isBusy}>
            Yeni oyun
          </Button>
        ) : null}
        <Button danger onClick={onLeave} loading={isBusy}>
          Masadan kalk
        </Button>
      </div>
    </>
  );
}

function resultText(table: MinigameTable, mySeat: number): string {
  if (table.draw) {
    return "Berabere.";
  }
  if (table.winner === mySeat) {
    return "Kazandın.";
  }
  return `${table.players[table.winner ?? 0]?.username ?? "Rakip"} kazandı.`;
}

/** XOX and Connect Four. Driven entirely off the board's own dimensions. */
function GridBoardView({
  board,
  game,
  isMyTurn,
  isBusy,
  onMove,
}: {
  board: MinigameGridBoard;
  game: MinigameTable["game"];
  isMyTurn: boolean;
  isBusy: boolean;
  onMove: (cell: number) => void;
}) {
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  // Presentation, not a rule: under gravity a whole column is one target, so
  // the hover highlight follows the column rather than the cell. The server
  // still decides where the mark lands.
  const hasGravity = game === "connect4";

  return (
    <div
      className="ct-minigame-board ct-versus-board"
      data-game={game}
      style={{ gridTemplateColumns: `repeat(${board.columns}, 1fr)` }}
      aria-label="Oyun tahtası"
      onMouseLeave={() => setHoveredColumn(null)}
    >
      {board.cells.map((owner, index) => {
        const column = index % board.columns;
        const isPlayable = isMyTurn && owner === -1;

        return (
          <button
            key={index}
            type="button"
            className="ct-versus-cell"
            data-owner={owner === -1 ? undefined : owner}
            data-last={board.lastCell === index ? "true" : undefined}
            data-winning={board.winningCells.includes(index) ? "true" : undefined}
            data-target={
              isPlayable && hasGravity && hoveredColumn === column ? "true" : undefined
            }
            // Disabled rather than merely ignored, so the cursor says so before
            // the click and the server never sees a doomed move.
            disabled={!isPlayable || isBusy}
            onMouseEnter={() => setHoveredColumn(column)}
            onClick={() => onMove(index)}
            aria-label={`${column + 1}. sütun, ${Math.floor(index / board.columns) + 1}. sıra`}
          />
        );
      })}
    </div>
  );
}
