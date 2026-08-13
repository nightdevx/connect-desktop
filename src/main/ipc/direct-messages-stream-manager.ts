import type { WebContents } from "electron";
import WebSocket from "ws";
import type { DirectMessagesStreamEvent } from "../../shared/desktop-api-types";
import { awaitSocketOpen } from "./await-socket-open";

export const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";

interface DirectMessagesStreamState {
  socket: WebSocket;
  closing: boolean;
  pingTimeout?: NodeJS.Timeout;
}

// One socket per window, carrying every conversation.
//
// This used to hold a Map<peerUserId, socket> and the renderer opened one entry
// per user in the directory: 39 websockets on a 40-person server, each with its
// own ping timer, its own reconnect backoff and its own 120-row history query
// on connect. The server side is now /chat/direct/ws with no peer in the path,
// and each frame names its own peerUserId.
export class DirectMessagesStreamManager {
  private readonly streamsBySender = new Map<
    number,
    DirectMessagesStreamState
  >();
  private readonly senderDestroyBound = new Set<number>();

  public constructor(private readonly backendBaseUrl: string) {}

  public stopAll(): void {
    for (const senderId of [...this.streamsBySender.keys()]) {
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

  // Resolves once the socket is open; see await-socket-open.ts for why.
  public async start(
    sender: WebContents,
    accessToken: string,
  ): Promise<{ started: boolean }> {
    this.stop(sender.id);

    const socket = new WebSocket(this.buildWebSocketUrl(accessToken));
    const opened = awaitSocketOpen(
      socket,
      "DIRECT_WS_CONNECTION_ERROR",
      "direct messages websocket",
    );
    const streamState: DirectMessagesStreamState = {
      socket,
      closing: false,
    };

    const heartbeat = (): void => {
      if (streamState.pingTimeout) {
        clearTimeout(streamState.pingTimeout);
      }

      streamState.pingTimeout = setTimeout(() => {
        if (streamState.closing || socket.readyState === WebSocket.CLOSED) {
          return;
        }
        socket.terminate();
      }, 35000);
    };

    const cleanup = (): void => {
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
        const payload = JSON.parse(raw) as DirectMessagesStreamEvent;
        this.emit(sender, payload);
      } catch {
        this.emit(sender, {
          type: "system-error",
          code: "INVALID_DIRECT_WS_PAYLOAD",
          message: "direct websocket payload parse edilemedi",
          at: new Date().toISOString(),
        });
      }
    });

    socket.on("error", (error) => {
      cleanup();

      // start() closes the previous socket, which may still be CONNECTING; it
      // then errors with "closed before the connection was established" against
      // a stream that has already been replaced.
      if (this.streamsBySender.get(sender.id)?.socket !== socket) {
        return;
      }

      if (streamState.closing || sender.isDestroyed()) {
        return;
      }

      this.emit(sender, {
        type: "system-error",
        code: "DIRECT_WS_CONNECTION_ERROR",
        message:
          error instanceof Error ? error.message : "direct websocket error",
        at: new Date().toISOString(),
      });
    });

    socket.on("close", (code, reasonBuffer) => {
      cleanup();
      const reason = reasonBuffer.toString();
      if (this.streamsBySender.get(sender.id)?.socket === socket) {
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

    await opened;
    return { started: true };
  }

  private emit(sender: WebContents, event: DirectMessagesStreamEvent): void {
    if (sender.isDestroyed()) {
      return;
    }

    sender.send(DIRECT_MESSAGES_EVENT_CHANNEL, event);
  }

  private buildWebSocketUrl(accessToken: string): string {
    const url = new URL(this.backendBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/chat/direct/ws";
    url.search = "";
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }
}
