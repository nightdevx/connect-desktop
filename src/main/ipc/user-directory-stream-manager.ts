import type { WebContents } from "electron";
import WebSocket from "ws";
import type { UserDirectoryStreamEvent } from "../../shared/desktop-api-types";

export const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";

interface UserDirectoryStreamState {
  socket: WebSocket;
  closing: boolean;
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

    const socket = new WebSocket(this.buildWebSocketURL(accessToken));
    const streamState: UserDirectoryStreamState = {
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

    socket.on("message", (data) => {
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
      const reason = reasonBuffer.toString();
      const active = this.streamsBySender.get(sender.id);
      if (active?.socket !== socket) {
        return;
      }

      this.streamsBySender.delete(sender.id);

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
