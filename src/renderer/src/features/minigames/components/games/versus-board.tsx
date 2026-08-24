import { Alert, Button, Spin } from "antd";
import { EyeOutlined, UserAddOutlined } from "@ant-design/icons";
import {
  MULTIPLAYER_SEATS,
  canStartTable,
  isTableFinished,
  isTableOpen,
  seatOf,
  spectatorsOf,
  type MinigameTable,
  type MultiplayerGameId,
} from "@shared/minigames";
import { GameShell, type StatusTone } from "../game-shell";
import { useMultiplayerTables } from "../../use-multiplayer-tables";
import { findVersusView } from "../../versus-views";
import type { VersusViewProps } from "../../versus-view";

interface VersusBoardProps {
  game: MultiplayerGameId;
  currentUserId: string;
}

/**
 * The table browser and one board, for every multiplayer game.
 *
 * A table is its own lobby: open one and it appears in everybody's list, join
 * one and you are playing, or take a seat in the audience and watch it without
 * touching it. No voice room is involved and none is required.
 *
 * It implements no rules. Whose turn it is, whether a move is legal, who won
 * and what a hand contains all arrive inside the table — the server decides
 * every one of them, and a second opinion here is a second thing to get wrong.
 * What is local is presentation only: which column the cursor is over, which
 * way a blokus piece is turned, and how a rack is sorted.
 *
 * Which BOARD gets drawn is a registry lookup rather than a branch, so this
 * file did not grow by fifteen conditionals when fifteen games arrived. What it
 * still owns is everything the games share: seats, turn indicator, result line,
 * rematch and the audience view.
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
    start,
    move,
    sendMove,
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
          onCell={move}
          onMove={sendMove}
          onStart={start}
          onRestart={restart}
          onLeave={leave}
          onStopWatching={stopWatching}
        />
      </div>
    );
  }

  // Seated somewhere else — including at a table for another game. An account
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
          game={game}
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
        onCell={move}
        onMove={sendMove}
        onStart={start}
        onRestart={restart}
        onLeave={leave}
        onStopWatching={stopWatching}
      />
    </div>
  );
}

function TableBrowser({
  game,
  tables,
  isBusy,
  onOpen,
  onJoin,
  onWatch,
}: {
  game: MultiplayerGameId;
  tables: readonly MinigameTable[];
  isBusy: boolean;
  onOpen: () => void;
  onJoin: (tableId: string) => void;
  onWatch: (tableId: string) => void;
}) {
  const seats = MULTIPLAYER_SEATS[game];

  return (
    <div className="ct-versus-browser">
      <div className="ct-versus-browser-head">
        <span className="ct-versus-browser-count">
          {tables.length > 0 ? `${tables.length} açık masa` : "Açık masa yok"}
          <span className="ct-versus-browser-seats">
            {seats.min === seats.max
              ? `${seats.max} kişilik`
              : `${seats.min}-${seats.max} kişilik`}
          </span>
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
            const canJoin = isTableOpen(table);

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
                  data-full={canJoin ? undefined : "true"}
                >
                  {table.started
                    ? "Oynanıyor"
                    : `${table.players.length}/${seats.max} — bekliyor`}
                </span>

                {/* A table that is full or already playing is listed rather than
                    hidden, and it is listed with something to press: seeing that
                    the game is being played was the answer to "is anyone here",
                    and İzle is the answer to "then let me see it". */}
                {canJoin ? (
                  <Button
                    size="small"
                    type="primary"
                    disabled={isBusy}
                    onClick={() => onJoin(table.id)}
                  >
                    Katıl
                  </Button>
                ) : (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => onWatch(table.id)}
                  >
                    İzle
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
 * Everything except the board itself is identical across all eighteen, which is
 * why the split is here: a new game brings a board and inherits the turn
 * indicator, the result line and the rematch button.
 *
 * It draws the audience view too, and takes no flag for it. A spectator is
 * simply somebody whose seat index is -1, and every branch that separates the
 * two reads that one number — so there is no second code path that can be given
 * a live board by mistake.
 */
function Board({
  table,
  currentUserId,
  isBusy,
  onCell,
  onMove,
  onStart,
  onRestart,
  onLeave,
  onStopWatching,
}: {
  table: MinigameTable;
  currentUserId: string;
  isBusy: boolean;
  onCell: (cell: number) => void;
  onMove: (move: string) => void;
  onStart: () => void;
  onRestart: () => void;
  onLeave: () => void;
  onStopWatching: () => void;
}) {
  const view = findVersusView(table.game);
  const seats = MULTIPLAYER_SEATS[table.game];

  const mySeat = seatOf(table, currentUserId);
  const isSpectating = mySeat < 0;
  const audience = spectatorsOf(table);
  const isFinished = isTableFinished(table);
  const isWaiting = !table.started;
  // Turn -1 is a simultaneous phase: everybody seated may move at once. It is
  // Battleship's fleet placement and nothing else, and it reads here as "it is
  // your turn", because it is.
  const isMyTurn =
    !isFinished && !isWaiting && !isSpectating && (table.turn < 0 || table.turn === mySeat);

  const viewProps: VersusViewProps = {
    table,
    mySeat,
    isMyTurn,
    isBusy,
    onCell,
    onMove,
  };

  const { columns, rows } = view.shape(table);

  const seatRow = (
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
          data-active={
            !isFinished && !isWaiting && (table.turn < 0 || table.turn === seat)
              ? "true"
              : undefined
          }
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

      {/* One empty chair per seat still free, so "we need one more" is a thing
          you can see rather than a number you have to subtract. */}
      {isWaiting
        ? Array.from(
            { length: Math.max(0, seats.max - table.players.length) },
            (_, slot) => (
              <span key={`empty-${slot}`} className="ct-versus-seat ct-versus-seat-empty">
                {slot === 0 ? <Spin size="small" /> : null}
                {slot === 0 ? "Bekleniyor…" : "Boş"}
              </span>
            ),
          )
        : null}

      {audience.length > 0 ? (
        <span
          className="ct-versus-audience"
          title={audience.map((watcher) => watcher.username).join(", ")}
        >
          <EyeOutlined aria-hidden="true" />
          <span className="ct-versus-audience-count">{audience.length}</span>
          <span className="ct-versus-audience-names">
            {audience
              .slice(0, 3)
              .map((watcher) =>
                watcher.userId === currentUserId ? "sen" : watcher.username,
              )
              .join(", ")}
            {audience.length > 3 ? ` +${audience.length - 3}` : ""}
          </span>
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
          text: waitingText(table, seats, isSpectating),
          tone: "wait",
        }
      : isSpectating
        ? {
            text:
              table.turn < 0
                ? "İkisi de aynı anda oynuyor."
                : `Sıra ${table.players[table.turn]?.username ?? "rakipte"}.`,
            tone: "them",
          }
        : isMyTurn
          ? { text: table.turn < 0 ? "Sıra beklemeden oyna." : "Sıra sende.", tone: "you" }
          : { text: "Rakibin oynuyor.", tone: "them" };

  return (
    <GameShell
      columns={columns}
      rows={rows}
      header={
        <>
          {seatRow}
          {view.Header ? <view.Header {...viewProps} /> : null}
        </>
      }
      actions={
        isSpectating ? (
          <Button size="small" onClick={onStopWatching}>
            İzlemeyi bırak
          </Button>
        ) : (
          <>
            {/* Only for the games that seat more than two, and only once enough
                people are here. A two-player table starts itself. */}
            {canStartTable(table) ? (
              <Button size="small" type="primary" onClick={onStart} loading={isBusy}>
                Başlat ({table.players.length}/{seats.max})
              </Button>
            ) : null}
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
      aside={view.Aside ? <view.Aside {...viewProps} /> : undefined}
    >
      <view.Board {...viewProps} />
    </GameShell>
  );
}

function waitingText(
  table: MinigameTable,
  seats: { min: number; max: number },
  isSpectating: boolean,
): string {
  const here = table.players.length;

  if (isSpectating) {
    return `Masa oyuncu bekliyor (${here}/${seats.max}).`;
  }
  if (here < seats.min) {
    return `Masan listede görünüyor. Başlamak için en az ${seats.min} kişi gerekiyor (${here}/${seats.max}).`;
  }
  return `${here}/${seats.max} kişi hazır. Başlat'a basınca oyun başlar ve masa kapanır.`;
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
