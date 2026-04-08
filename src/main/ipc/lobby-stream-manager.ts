import type { WebContents } from "electron";
import WebSocket from "ws";
import type { LobbyStreamEvent } from "../../shared/desktop-api-types";

export const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";

interface LobbyStreamState {
  socket: WebSocket;
  closing: boolean;
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
    try {
      stream.socket.close(1000, "client-stop");
    } catch {
      // no-op
    }

    return { stopped: true };
  }

  public start(sender: WebContents, accessToken: string): { started: boolean } {
    this.stop(sender.id);

    const wsUrl = this.buildWebSocketUrl(accessToken);
    const socket = new WebSocket(wsUrl);
    const streamState: LobbyStreamState = {
      socket,
      closing: false,
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
      this.emit(sender, {
        type: "stream-status",
        status: "connected",
        at: new Date().toISOString(),
      });
    });

    socket.on("message", (data) => {
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
