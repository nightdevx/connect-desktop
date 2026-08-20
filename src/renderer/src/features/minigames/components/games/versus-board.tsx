import { useState, type CSSProperties } from "react";
import { Alert, Button, Spin } from "antd";
import { EyeOutlined, UserAddOutlined } from "@ant-design/icons";
import {
  isTableFinished,
  seatOf,
  type MinigameGridBoard,
  type MinigameTable,
  type MultiplayerGameId,
} from "@shared/minigames";
import { ChessBoardView, ChessSheet, ChessTicker } from "./chess-board-view";
import { GameShell, type StatusTone } from "../game-shell";
import { useMultiplayerTables } from "../../use-multiplayer-tables";

interface VersusBoardProps {
  game: MultiplayerGameId;
  currentUserId: string;
}

/**
 * The table browser and one board, for all three two-player games.
 *
 * A table is its own lobby: open one and it appears in everybody's list, join
 * one and you are playing, or take a seat in the audience and watch it without
 * touching it. No voice room is involved and none is required.
 *
 * It implements no rules. Whose turn it is, whether a cell is free, who won and
 * which cells made the line all arrive inside the table — the server decides
 * every one of them, and a second opinion here is a second thing to get wrong.
 * What is local is presentation only: which column the cursor is over, and
 * which seat gets which colour.
 *
 * Watching costs the server nothing and needs nothing new from it: every table
 * change is already broadcast to every signed-in client, because a table is
 * public by design. The audience is a client-side reading of a frame the socket
 * was sending anyway.
 */
export function VersusBoard({ game, currentUserId }: VersusBoardProps) {
  const {
    myTable,
    otherTables,
    watching,
    watch,
    stopWatching,
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

  // Wrapped, like every other branch. Returned bare it was a grid item with no
  // `grid-area`, so the page auto-placed it into whichever cell it found rather
  // than into the one the board belongs in.
  if (isLoading) {
    return (
      <div className="ct-versus">
        <div className="ct-versus-state">
          <Spin />
          <p>Masalar okunuyor…</p>
        </div>
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

  // The audience outranks a seat at another game's table, and deliberately so:
  // pressing İzle has to produce the thing it names. Sitting down clears the
  // watch, so this can never be the view of a table the user is playing at.
  if (watching && watching.game === game) {
    return (
      <div className="ct-versus">
        {errorBanner}
        <Board
          table={watching}
          currentUserId={currentUserId}
          isBusy={isBusy}
          onCellMove={move}
          onChessMove={chessMove}
          onRestart={restart}
          onLeave={leave}
          onStopWatching={stopWatching}
        />
      </div>
    );
  }

  // Seated somewhere else — including at a table for the OTHER game. An account
  // holds one seat at a time, so saying which is more useful than offering a
  // second table the server would refuse to give.
  if (myTable && myTable.game !== game) {
    return (
      <div className="ct-versus">
        {errorBanner}
        <div className="ct-versus-state">
          <p className="ct-versus-state-title">Başka bir masadasın.</p>
          <p className="ct-versus-state-hint">
            Aynı anda tek masada oturabilirsin. Buradan oynamak için önce o masadan
            kalk — ya da sağdaki Canlı Masalar listesinden bir oyunu izle.
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
      <div className="ct-versus">
        {errorBanner}
        <TableBrowser
          tables={otherTables}
          isBusy={isBusy}
          onOpen={open}
          onJoin={join}
          onWatch={watch}
        />
      </div>
    );
  }

  return (
    <div className="ct-versus">
      {errorBanner}
      <Board
        table={myTable}
        currentUserId={currentUserId}
        isBusy={isBusy}
        onCellMove={move}
        onChessMove={chessMove}
        onRestart={restart}
        onLeave={leave}
        onStopWatching={stopWatching}
      />
    </div>
  );
}

function TableBrowser({
  tables,
  isBusy,
  onOpen,
  onJoin,
  onWatch,
}: {
  tables: readonly MinigameTable[];
  isBusy: boolean;
  onOpen: () => void;
  onJoin: (tableId: string) => void;
  onWatch: (tableId: string) => void;
}) {
  return (
    <div className="ct-versus-browser">
      <div className="ct-versus-browser-head">
        <span className="ct-versus-browser-count">
          {tables.length > 0 ? `${tables.length} açık masa` : "Açık masa yok"}
        </span>
        <Button type="primary" onClick={onOpen} loading={isBusy}>
          Masa aç
        </Button>
      </div>

      {tables.length === 0 ? (
        <div className="ct-versus-state">
          <span className="ct-versus-state-icon" aria-hidden="true">
            <UserAddOutlined />
          </span>
          <p className="ct-versus-state-title">Şu anda kimse beklemiyor.</p>
          <p className="ct-versus-state-hint">
            Masa aç — açtığın masa herkesin listesinde görünür ve biri oturunca oyun
            başlar.
          </p>
        </div>
      ) : (
        <ul className="ct-versus-table-list">
          {tables.map((table) => {
            const isFull = table.players.length >= 2;

            return (
              <li key={table.id} className="ct-versus-table-row">
                <span className="ct-versus-table-players">
                  {table.players.map((player, seat) => (
                    <span key={player.userId} className="ct-versus-table-player">
                      <span
                        className="ct-versus-mark"
                        data-seat={seat}
                        aria-hidden="true"
                      />
                      <span className="ct-versus-table-name">{player.username}</span>
                    </span>
                  ))}
                </span>

                <span
                  className="ct-versus-table-state"
                  data-full={isFull ? "true" : undefined}
                >
                  {isFull ? "Oynanıyor" : "Rakip bekliyor"}
                </span>

                {/* A full table is listed rather than hidden, and now it is
                    listed with something to press: seeing that the game is being
                    played was the answer to "is anyone here", and İzle is the
                    answer to "then let me see it". */}
                {isFull ? (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => onWatch(table.id)}
                  >
                    İzle
                  </Button>
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    disabled={isBusy}
                    onClick={() => onJoin(table.id)}
                  >
                    Katıl
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The seats, one board and the buttons, in the shell every game shares.
 *
 * Everything except the board itself is identical across the three, which is
 * why the split is here: a new game brings a board and inherits the turn
 * indicator, the result line and the rematch button.
 *
 * It draws the audience view too, and takes no flag for it. A spectator is
 * simply somebody whose seat index is -1, and every branch that separates the
 * two reads that one number — so there is no second code path that can be given
 * a live board by mistake. The cells are disabled for the same reason: the
 * server refuses a move from an unseated account regardless, and a UI that
 * offers one is a UI that lies.
 */
function Board({
  table,
  currentUserId,
  isBusy,
  onCellMove,
  onChessMove,
  onRestart,
  onLeave,
  onStopWatching,
}: {
  table: MinigameTable;
  currentUserId: string;
  isBusy: boolean;
  onCellMove: (cell: number) => void;
  onChessMove: (uci: string) => void;
  onRestart: () => void;
  onLeave: () => void;
  onStopWatching: () => void;
}) {
  const mySeat = seatOf(table, currentUserId);
  const isSpectating = mySeat < 0;
  const isFinished = isTableFinished(table);
  const isWaiting = table.players.length < 2;
  const isMyTurn = !isFinished && !isWaiting && table.turn === mySeat;

  const seats = (
    <div className="ct-versus-seats">
      {/* Said out loud, and IN the seat row rather than above it. The board
          refuses every click while watching, and a disabled board with nothing
          explaining it reads as a broken one -- but a badge on its own line is
          also a whole row of height taken off the board it is describing. */}
      {isSpectating ? (
        <span className="ct-versus-watching">
          <EyeOutlined aria-hidden="true" />
          İzliyorsun
        </span>
      ) : null}
      {table.players.map((player, seat) => (
        <span
          key={player.userId}
          className="ct-versus-seat"
          data-seat={seat}
          // Only while the game is live: leaving it on after a win would pulse
          // the loser's name if they happened to be next in turn.
          data-active={!isFinished && !isWaiting && table.turn === seat ? "true" : undefined}
        >
          <span className="ct-versus-mark" data-seat={seat} aria-hidden="true" />
          <span className="ct-versus-seat-name">
            {player.username}
            {player.userId === currentUserId ? " (sen)" : ""}
          </span>
          {/* Seat 0 is white by definition, so the seat colour already says
              this — spelling it out saves the player working it out from a
              swatch they have not learnt yet. */}
          {table.chess ? (
            <span className="ct-versus-seat-side">{seat === 0 ? "beyaz" : "siyah"}</span>
          ) : null}
        </span>
      ))}
      {isWaiting ? (
        <span className="ct-versus-seat ct-versus-seat-empty">
          <Spin size="small" />
          Rakip bekleniyor…
        </span>
      ) : null}
    </div>
  );

  const status: { text: string; tone: StatusTone } = isFinished
    ? {
        // Chess says HOW it ended — stalemate and insufficient material are both
        // draws, and "Berabere." alone leaves the players arguing.
        text: `${resultText(table, mySeat)}${table.chess?.outcome ? ` ${table.chess.outcome}.` : ""}`,
        tone: "done",
      }
    : isWaiting
      ? {
          text: isSpectating
            ? "Masa rakip bekliyor. Biri oturunca oyun başlar."
            : "Masan listede görünüyor. Biri oturunca oyun başlar.",
          tone: "wait",
        }
      : isSpectating
        ? {
            text: `Sıra ${table.players[table.turn]?.username ?? "rakipte"}.`,
            tone: "them",
          }
        : isMyTurn
          ? { text: "Sıra sende.", tone: "you" }
          : { text: "Rakibin oynuyor.", tone: "them" };

  const board = table.grid ?? { columns: 8, rows: 8 };

  return (
    <GameShell
      columns={board.columns}
      rows={board.rows}
      header={
        <>
          {seats}
          {table.chess ? <ChessTicker board={table.chess} mySeat={mySeat} /> : null}
        </>
      }
      actions={
        isSpectating ? (
          <Button size="small" onClick={onStopWatching}>
            İzlemeyi bırak
          </Button>
        ) : (
          <>
            {/* Only once there is somebody to have a rematch with. On an empty
                table it would deal a fresh board nobody has played on. */}
            {!isWaiting ? (
              <Button size="small" onClick={onRestart} loading={isBusy}>
                Yeni oyun
              </Button>
            ) : null}
            <Button size="small" danger onClick={onLeave} loading={isBusy}>
              Masadan kalk
            </Button>
          </>
        )
      }
      status={status}
      aside={table.chess ? <ChessSheet board={table.chess} /> : undefined}
    >
      {table.grid ? (
        <GridBoardView
          board={table.grid}
          game={table.game}
          state={boardState(table, mySeat)}
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
    </GameShell>
  );
}

// The board wears the result too, not only the line under it: a win that is
// only written down is a win somebody misses.
//
// From the AUDIENCE there is no loss to wear. A spectator's seat is -1, which is
// nobody's winning seat, so reading the result through `mySeat` alone would
// shake the board red at somebody who was not playing.
function boardState(table: MinigameTable, mySeat: number): string | undefined {
  if (table.draw) {
    return "draw";
  }
  if (table.winner === null) {
    return undefined;
  }
  if (mySeat < 0) {
    return "won";
  }
  return table.winner === mySeat ? "won" : "lost";
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
  state,
  isMyTurn,
  isBusy,
  onMove,
}: {
  board: MinigameGridBoard;
  game: MinigameTable["game"];
  /** "won", "lost", "draw" or undefined while it is still being played. */
  state: string | undefined;
  isMyTurn: boolean;
  isBusy: boolean;
  onMove: (cell: number) => void;
}) {
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  // Presentation, not a rule: under gravity a whole column is one target, so the
  // hover highlight follows the column rather than the cell. The server still
  // decides where the mark lands.
  const hasGravity = game === "connect4";

  return (
    <div
      className="ct-board ct-versus-board"
      data-game={game}
      data-state={state}
      aria-label="Oyun tahtası"
      onMouseLeave={() => setHoveredColumn(null)}
    >
      {board.cells.map((owner, index) => {
        const column = index % board.columns;
        const row = Math.floor(index / board.columns);
        const isPlayable = isMyTurn && owner === -1;
        const isLanded = board.lastCell === index;

        return (
          <button
            key={index}
            type="button"
            className="ct-versus-cell"
            data-last={isLanded ? "true" : undefined}
            data-winning={(board.winningCells ?? []).includes(index) ? "true" : undefined}
            data-target={
              isPlayable && hasGravity && hoveredColumn === column ? "true" : undefined
            }
            // Disabled rather than merely ignored, so the cursor says so before
            // the click and the server never sees a doomed move.
            disabled={!isPlayable || isBusy}
            onMouseEnter={() => setHoveredColumn(column)}
            onClick={() => onMove(index)}
            aria-label={`${column + 1}. sütun, ${row + 1}. sıra`}
          >
            {/* The mark is a child rather than the slot itself, so it can move
                into an empty hole that stays put. Keyed on the owner so a mark
                landing in a slot is a mount, which is what replays the drop. */}
            {owner === -1 ? null : (
              <span
                key={owner}
                className="ct-versus-disc"
                data-owner={owner}
                data-landed={isLanded ? "true" : undefined}
                // How far it fell, in rows, for the gravity game. Under Connect
                // Four a disc enters at the top of its column and stops where it
                // stops; a pop in place would say nothing about which column it
                // went down.
                style={
                  isLanded && hasGravity
                    ? ({ "--drop": String(row + 1) } as CSSProperties)
                    : undefined
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
