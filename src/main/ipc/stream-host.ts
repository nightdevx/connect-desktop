import type { MessagePortMain } from "electron";
import { DesktopApiError } from "../clients/base-client";
import { DirectMessagesStreamManager } from "./direct-messages-stream-manager";
import { LobbyStreamManager } from "./lobby-stream-manager";
import { UserDirectoryStreamManager } from "./user-directory-stream-manager";
import { StreamHub, type StreamSender } from "./stream-hub";
import type {
  StreamHostError,
  StreamHostReply,
  StreamHostRequest,
  StreamPortMessage,
} from "../../shared/stream-host-contracts";

// The stream host's side of the conversation with main: what runs inside the
// utility process (stream-host-process.ts wires it to process.parentPort).
// Electron-free apart from the port type, so the self-check can drive it with
// a plain object for a port.

type PagePort = Pick<MessagePortMain, "postMessage" | "close">;

/** A page as the sockets see it: its events go out over the port main gave it. */
class PageSender implements StreamSender {
  private port: PagePort | null = null;
  private gone = false;
  private readonly onGone: Array<() => void> = [];

  public constructor(public readonly id: number) {}

  // A reload asks for a new port; the old page's end is already gone.
  public setPort(port: PagePort): void {
    this.port?.close();
    this.port = port;
  }

  public send(channel: string, payload: unknown): void {
    const message: StreamPortMessage = { channel, payload };
    this.port?.postMessage(message);
  }

  public isDestroyed(): boolean {
    return this.gone;
  }

  public once(_event: "destroyed", listener: () => void): void {
    this.onGone.push(listener);
  }

  public destroy(): void {
    this.gone = true;
    this.port?.close();
    this.port = null;
    for (const listener of this.onGone.splice(0)) {
      listener();
    }
  }
}

const toHostError = (error: unknown): StreamHostError => {
  if (error instanceof DesktopApiError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }
  return {
    code: "UNEXPECTED_ERROR",
    statusCode: 500,
    message: error instanceof Error ? error.message : "Unexpected stream host error",
  };
};

/**
 * The renderer's stream sockets, driven by messages from main.
 *
 * Returns the handler for one message from main. `reply` carries the outcome of
 * each start back; `backendAnswers` is the /healthz probe StreamHub uses to
 * tell a backend without /ws from one that is down.
 */
export const createStreamHost = (
  backendBaseUrl: string,
  reply: (message: StreamHostReply) => void,
  backendAnswers: () => Promise<boolean>,
): ((message: StreamHostRequest, ports: PagePort[]) => void) => {
  // For a backend that predates /ws. See stream-hub.ts.
  const legacy = {
    lobby: new LobbyStreamManager(backendBaseUrl),
    users: new UserDirectoryStreamManager(backendBaseUrl),
    dm: new DirectMessagesStreamManager(backendBaseUrl),
  } as const;

  const hub = new StreamHub(backendBaseUrl, {
    start: async (kind, sender, accessToken) => {
      await legacy[kind].start(sender, accessToken);
    },
    stop: (kind, senderId) => {
      legacy[kind].stop(senderId);
    },
    probe: () => {
      for (const manager of Object.values(legacy)) {
        manager.probe();
      }
    },
    stopAll: () => {
      for (const manager of Object.values(legacy)) {
        manager.stopAll();
      }
    },
    backendAnswers,
  });

  const pages = new Map<number, PageSender>();
  const pageFor = (senderId: number): PageSender => {
    let page = pages.get(senderId);
    if (!page) {
      page = new PageSender(senderId);
      pages.set(senderId, page);
    }
    return page;
  };

  return (message, ports) => {
    switch (message.type) {
      case "attach":
        if (ports[0]) {
          pageFor(message.senderId).setPort(ports[0]);
        }
        return;
      case "start":
        hub.start(message.kind, pageFor(message.senderId), message.accessToken).then(
          () => reply({ type: "started", id: message.id }),
          (error: unknown) => reply({ type: "started", id: message.id, error: toHostError(error) }),
        );
        return;
      case "stop":
        hub.stop(message.kind, message.senderId);
        return;
      case "stop-all":
        hub.stopAll();
        return;
      case "probe":
        hub.probe();
        return;
      case "sender-gone":
        pages.get(message.senderId)?.destroy();
        pages.delete(message.senderId);
        return;
    }
  };
};
