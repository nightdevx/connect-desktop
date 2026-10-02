import type { WebContents } from "electron";
import WebSocket from "ws";
import type { UserDirectoryStreamEvent } from "../../shared/desktop-api-types";
import { awaitSocketOpen } from "./await-socket-open";

export const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";

interface UserDirectoryStreamState {
  socket: WebSocket;
  closing: boolean;
  pingTimeout?: NodeJS.Timeout;
  // Settles with the handshake. A second start while it is pending joins it
  // instead of tearing it down.
  opened?: Promise<void>;
  probeTimer?: NodeJS.Timeout;
}

export class UserDirectoryStreamManager {
  private readonly streamsBySender = new Map<
    number,
    UserDirectoryStreamState
  >();
  private readonly senderDestroyBound = new Set<number>();

  public constructor(private readonly backendBaseUrl: string) {}

  public stopAll(): void {
    for (const senderId of this.streamsBySender.keys()) {
      this.stop(senderId);
    }
  }

  // Pings every open socket; one that does not answer within 5s is
  // terminated, and its close starts the renderer's reconnect. For the
  // network coming back and the machine waking, when a socket can look open
  // and be dead.
  public probe(): void {
    for (const stream of this.streamsBySender.values()) {
      if (stream.closing || stream.socket.readyState !== WebSocket.OPEN || stream.probeTimer) {
        continue;
      }
      const socket = stream.socket;
      stream.probeTimer = setTimeout(() => {
        stream.probeTimer = undefined;
        socket.terminate();
      }, 5_000);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
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
    // A live socket is kept, and one still connecting is joined: this used to
    // stop and redial on every start, so "the network came back" replaced a
    // healthy connection. Whether it is still alive is probe()'s question.
    const existing = this.streamsBySender.get(sender.id);
    if (existing && !existing.closing) {
      if (existing.socket.readyState === WebSocket.OPEN) {
        return { started: true };
      }
      if (existing.socket.readyState === WebSocket.CONNECTING) {
        await existing.opened;
        return { started: true };
      }
    }
    this.stop(sender.id);

    const socket = new WebSocket(this.buildWebSocketURL(accessToken), { handshakeTimeout: 10_000 });
    const opened = awaitSocketOpen(
      socket,
      "USER_DIRECTORY_WS_CONNECTION_ERROR",
      "user directory websocket",
    );
    const streamState: UserDirectoryStreamState = {
      socket,
      closing: false,
    };

    const heartbeat = () => {
      if (streamState.pingTimeout) {
        clearTimeout(streamState.pingTimeout);
      }
      if (streamState.probeTimer) {
        clearTimeout(streamState.probeTimer);
        streamState.probeTimer = undefined;
      }

      streamState.pingTimeout = setTimeout(() => {
        if (streamState.closing || socket.readyState === WebSocket.CLOSED) {
          return;
        }
        socket.terminate();
      // Past the server's 20s ping and 40s deadline; see lobby-stream-manager.
      }, 50_000);
    };

    const cleanup = () => {
      if (streamState.pingTimeout) {
        clearTimeout(streamState.pingTimeout);
        streamState.pingTimeout = undefined;
      }
    };

    streamState.opened = opened;
    this.streamsBySender.set(sender.id, streamState);

    if (!this.senderDestroyBound.has(sender.id)) {
      this.senderDestroyBound.add(sender.id);
      sender.once("destroyed", () => {
        this.stop(sender.id);
        this.senderDestroyBound.delete(sender.id);
      });
    }

    let didOpen = false;
    socket.on("open", () => {
      didOpen = true;
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

    socket.on("pong", () => {
      heartbeat();
    });

    socket.on("message", (data) => {
      heartbeat();
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      if (!raw.trim()) {
        return;
      }

      try {
        const payload = JSON.parse(raw) as UserDirectoryStreamEvent;
        this.emit(sender, payload);
      } catch {
        this.emit(sender, {
          type: "system-error",
          code: "INVALID_USER_DIRECTORY_WS_PAYLOAD",
          message: "user directory websocket payload parse edilemedi",
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

      this.emit(sender, {
        type: "system-error",
        code: "USER_DIRECTORY_WS_CONNECTION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "user directory websocket error",
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

      this.streamsBySender.delete(sender.id);

      // Only a socket that was open can close. A dial that fails gets its
      // close from ws in the same tick as the error, before the rejection below
      // is handled, so the guard there came too late: every failed attempt
      // still announced "closed", and the renderer scheduled a second
      // reconnect on top of the one the rejection drives.
      if (streamState.closing || !didOpen) {
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

  private emit(sender: WebContents, event: UserDirectoryStreamEvent): void {
    if (sender.isDestroyed()) {
      return;
    }

    sender.send(USER_DIRECTORY_EVENT_CHANNEL, event);
  }

  private buildWebSocketURL(accessToken: string): string {
    const url = new URL(this.backendBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/auth/users/ws";
    url.search = "";
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }
}
