import type { WebContents } from "electron";
import WebSocket from "ws";
import type { DirectMessagesStreamEvent } from "../../shared/desktop-api-types";

export const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";

interface DirectMessagesStreamState {
  peerUserId: string;
  socket: WebSocket;
  closing: boolean;
}

export class DirectMessagesStreamManager {
  private readonly streamsBySender = new Map<
    number,
    Map<string, DirectMessagesStreamState>
  >();
  private readonly senderDestroyBound = new Set<number>();

  public constructor(private readonly backendBaseUrl: string) {}

  public stopAll(): void {
    for (const senderId of this.streamsBySender.keys()) {
      this.stop(senderId);
    }
  }

  public stop(
    senderId: number,
    peerUserId?: string,
  ): { stopped: boolean; peerUserId: string | null } {
    const senderStreams = this.streamsBySender.get(senderId);
    if (!senderStreams) {
      return { stopped: false, peerUserId: null };
    }

    if (peerUserId) {
      const stream = senderStreams.get(peerUserId);
      if (!stream) {
        return { stopped: false, peerUserId };
      }

      stream.closing = true;
      senderStreams.delete(peerUserId);
      try {
        stream.socket.close(1000, "client-stop");
      } catch {
        // no-op
      }

      if (senderStreams.size === 0) {
        this.streamsBySender.delete(senderId);
      }

      return { stopped: true, peerUserId };
    }

    senderStreams.forEach((stream) => {
      stream.closing = true;
      try {
        stream.socket.close(1000, "client-stop");
      } catch {
        // no-op
      }
    });

    this.streamsBySender.delete(senderId);

    return { stopped: true, peerUserId: null };
  }

  public start(
    sender: WebContents,
    peerUserId: string,
    accessToken: string,
  ): { started: boolean; peerUserId: string } {
    this.stop(sender.id, peerUserId);

    let senderStreams = this.streamsBySender.get(sender.id);
    if (!senderStreams) {
      senderStreams = new Map<string, DirectMessagesStreamState>();
      this.streamsBySender.set(sender.id, senderStreams);
    }

    const wsUrl = this.buildWebSocketUrl(peerUserId, accessToken);
    const socket = new WebSocket(wsUrl);
    const streamState: DirectMessagesStreamState = {
      peerUserId,
      socket,
      closing: false,
    };

    senderStreams.set(peerUserId, streamState);

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
        peerUserId,
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
        const payload = JSON.parse(raw) as DirectMessagesStreamEvent;
        this.emit(sender, payload);
      } catch {
        this.emit(sender, {
          type: "system-error",
          peerUserId,
          code: "INVALID_DIRECT_WS_PAYLOAD",
          message: "direct websocket payload parse edilemedi",
          at: new Date().toISOString(),
        });
      }
    });

    socket.on("error", (error) => {
      this.emit(sender, {
        type: "system-error",
        peerUserId,
        code: "DIRECT_WS_CONNECTION_ERROR",
        message:
          error instanceof Error ? error.message : "direct websocket error",
        at: new Date().toISOString(),
      });
    });

    socket.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      const activeBucket = this.streamsBySender.get(sender.id);
      const active = activeBucket?.get(peerUserId);
      if (active?.socket === socket) {
        activeBucket?.delete(peerUserId);
        if (activeBucket && activeBucket.size === 0) {
          this.streamsBySender.delete(sender.id);
        }
      }

      if (streamState.closing) {
        return;
      }

      this.emit(sender, {
        type: "stream-status",
        peerUserId,
        status: "closed",
        detail: reason || `websocket closed (${code})`,
        at: new Date().toISOString(),
      });
    });

    return { started: true, peerUserId };
  }

  private emit(sender: WebContents, event: DirectMessagesStreamEvent): void {
    if (sender.isDestroyed()) {
      return;
    }

    sender.send(DIRECT_MESSAGES_EVENT_CHANNEL, event);
  }

  private buildWebSocketUrl(peerUserId: string, accessToken: string): string {
    const url = new URL(this.backendBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `/chat/direct/${encodeURIComponent(peerUserId)}/ws`;
    url.search = "";
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }
}
