import type { WebContents } from "electron";
import WebSocket from "ws";
import type { LobbyStreamEvent } from "../../shared/desktop-api-types";
import { awaitSocketOpen } from "./await-socket-open";

export const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";

interface LobbyStreamState {
  socket: WebSocket;
  closing: boolean;
  pingTimeout?: NodeJS.Timeout;
}

export class LobbyStreamManager {
  private readonly streamsBySender = new Map<number, LobbyStreamState>();
  private readonly senderDestroyBound = new Set<number>();

  public constructor(private readonly backendBaseUrl: string) {}

  public stopAll(): void {
    for (const senderId of this.streamsBySender.keys()) {
      this.stop(senderId);
    }
  }

  public stop(senderId: number): { stopped: boolean } {
    const stream = this.streamsBySender.get(senderId);
    if (!stream) {
      return { stopped: false };
    }

    stream.closing = true;
    this.streamsBySender.delete(senderId);
    if (stream.pingTimeout) {
      clearTimeout(stream.pingTimeout);
    }
    try {
      stream.socket.close(1000, "client-stop");
    } catch {
      // no-op
    }

    return { stopped: true };
  }

  // Resolves once the socket is actually open, rejects if it fails before that.
  //
  // This used to return `{started:true}` synchronously, before the connect even
  // began. The renderer took that as success and reset its backoff counter, so
  // with the backend down the exponential backoff never escalated past its 1s
  // base: every installed client re-dialled roughly once a second forever, and
  // each `closed` event also fired two fallback HTTP requests.
  public async start(
    sender: WebContents,
    accessToken: string,
  ): Promise<{ started: boolean }> {
    this.stop(sender.id);

    const wsUrl = this.buildWebSocketUrl(accessToken);
    // handshakeTimeout is not optional here.
    //
    // Without it a stalled TCP connect or a proxy that accepts the socket and
    // never answers the upgrade fires no `open`, no `error` and no `close`:
    // awaitSocketOpen never settles, so this promise never settles, so the
    // renderer's reconnect scheduler — which cleared its timer before calling
    // us — has nothing left to re-arm. The lobby socket stays dead for the rest
    // of the session, which used to mean the server stopped seeing a heartbeat
    // and dropped the user out of the voice room.
    const socket = new WebSocket(wsUrl, { handshakeTimeout: 10_000 });
    const streamState: LobbyStreamState = {
      socket,
      closing: false,
    };

    const opened = awaitSocketOpen(
      socket,
      "LOBBY_WS_CONNECTION_ERROR",
      "lobby websocket",
    );

    const heartbeat = () => {
      if (streamState.pingTimeout) {
        clearTimeout(streamState.pingTimeout);
      }

      // The server pings every 20s and gives up on us after 40s of silence.
      //
      // At 35s this watchdog had 15s of slack over that ping and killed the
      // connection first — with terminate(), an immediate RST, no probe. An
      // idle lobby sends no data frames at all (the snapshot ticker is
      // signature-deduped server-side), so the ping IS the only traffic, and
      // one coalesced by the proxy or delayed by a main-process stall was
      // enough to tear down a healthy socket. Every such teardown cascades into
      // a full re-join.
      //
      // 50s is 2.5 ping intervals, and lands after the server's own 40s
      // deadline — so a truly dead peer is closed by the side that can tell,
      // and this is only the backstop.
      streamState.pingTimeout = setTimeout(() => {
        if (streamState.closing || socket.readyState === WebSocket.CLOSED) {
          return;
        }
        socket.terminate();
      }, 50_000);
    };

    const cleanup = () => {
      if (streamState.pingTimeout) {
        clearTimeout(streamState.pingTimeout);
        streamState.pingTimeout = undefined;
      }
    };

    this.streamsBySender.set(sender.id, streamState);

    if (!this.senderDestroyBound.has(sender.id)) {
      this.senderDestroyBound.add(sender.id);
      sender.once("destroyed", () => {
        this.stop(sender.id);
        this.senderDestroyBound.delete(sender.id);
      });
    }

    socket.on("open", () => {
      heartbeat();
      this.emit(sender, {
        type: "stream-status",
        status: "connected",
        at: new Date().toISOString(),
      });
    });

    socket.on("ping", () => {
      heartbeat();
    });

    socket.on("message", (data) => {
      heartbeat();
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      if (!raw.trim()) {
        return;
      }

      try {
        const payload = JSON.parse(raw) as LobbyStreamEvent;
        this.emit(sender, payload);
      } catch {
        this.emit(sender, {
          type: "system-error",
          code: "INVALID_LOBBY_WS_PAYLOAD",
          message: "lobby websocket payload parse edilemedi",
          at: new Date().toISOString(),
        });
      }
    });

    socket.on("error", (error) => {
      cleanup();
      const active = this.streamsBySender.get(sender.id);
      if (active?.socket !== socket) {
        return;
      }

      if (streamState.closing || sender.isDestroyed()) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "lobby websocket error";

      if (this.shouldSuppressTransientCloseError(socket, message)) {
        return;
      }

      this.emit(sender, {
        type: "system-error",
        code: "LOBBY_WS_CONNECTION_ERROR",
        message,
        at: new Date().toISOString(),
      });
    });

    socket.on("close", (code, reasonBuffer) => {
      cleanup();
      const reason = reasonBuffer.toString();
      const active = this.streamsBySender.get(sender.id);
      if (active?.socket !== socket) {
        return;
      }

      if (active?.socket === socket) {
        this.streamsBySender.delete(sender.id);
      }

      if (streamState.closing) {
        return;
      }

      this.emit(sender, {
        type: "stream-status",
        status: "closed",
        detail: reason || `websocket closed (${code})`,
        at: new Date().toISOString(),
      });
    });

    try {
      await opened;
    } catch (error) {
      // A socket that never opened must not announce a closure.
      //
      // The failed attempt used to stay in streamsBySender until its own `close`
      // fired, and that close reached the renderer as `stream-status: closed` —
      // which schedules another reconnect AND runs the two-request REST
      // fallback. So one failed dial produced a second one, plus traffic, for a
      // connection that had never existed. Worse, the caller (withAccessToken)
      // retries on a 401, so the retry and the ghost raced each other.
      streamState.closing = true;
      if (this.streamsBySender.get(sender.id) === streamState) {
        this.streamsBySender.delete(sender.id);
      }
      cleanup();
      try {
        socket.terminate();
      } catch {
        // Already gone.
      }
      throw error;
    }

    return { started: true };
  }

  private emit(sender: WebContents, event: LobbyStreamEvent): void {
    if (sender.isDestroyed()) {
      return;
    }

    sender.send(LOBBY_STREAM_EVENT_CHANNEL, event);
  }

  private shouldSuppressTransientCloseError(
    socket: WebSocket,
    message: string,
  ): boolean {
    const normalized = message.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (
      normalized.includes("closed before the connection was established") ||
      normalized.includes("was closed before the connection")
    ) {
      return socket.readyState === WebSocket.CONNECTING;
    }

    return false;
  }

  private buildWebSocketUrl(accessToken: string): string {
    const url = new URL(this.backendBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/lobby/ws";
    url.search = "";
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }
}
