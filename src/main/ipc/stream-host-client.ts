import {
  MessageChannelMain,
  utilityProcess,
  type UtilityProcess,
  type WebContents,
} from "electron";
import { DesktopApiError } from "../clients/base-client";
import { STREAM_EVENT_CHANNELS } from "./stream-frames";
import type {
  StreamHostReply,
  StreamHostRequest,
  StreamKind,
} from "../../shared/stream-host-contracts";

// A page asks for its port as it loads; main answers on the second channel with
// the port as the message's transfer. See the preload.
export const STREAM_PORT_REQUEST_CHANNEL = "desktop:stream-port-request";
export const STREAM_PORT_CHANNEL = "desktop:stream-port";

// Restarting a host that died: at once after a long run, then backing off while
// it keeps dying soon after starting, so a host that crashes on start is not
// respawned in a tight loop.
const RESTART_BASE_MS = 500;
const RESTART_MAX_MS = 30_000;
const STABLE_RUN_MS = 30_000;

export const restartDelayMs = (quickExits: number): number =>
  Math.min(RESTART_MAX_MS, RESTART_BASE_MS * 2 ** quickExits);

interface PendingStart {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Main's handle on the stream host (stream-host-process.ts): the same start,
 * stop, stopAll and probe the IPC handlers called on StreamHub when it lived in
 * main, so they did not change.
 *
 * Main keeps the windows and the session. It spawns the host, passes each start
 * its access token, gives every page a MessagePort to it, and restarts it when
 * it dies. Frames go from the host to the page over that port; main is not on
 * their path, so a stall here no longer delays them.
 */
export class StreamHostClient {
  private child: UtilityProcess | null = null;
  private spawnedAt = 0;
  private quickExits = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingStart>();
  // Every page with a port to the host, by webContents id.
  private readonly pages = new Map<number, WebContents>();
  // What each page has started and not stopped: who hears it when the host dies.
  private readonly started = new Map<number, Set<StreamKind>>();

  public constructor(
    private readonly modulePath: string,
    private readonly backendBaseUrl: string,
  ) {}

  /**
   * Gives a page a fresh port to the host. Every page load asks once. With no
   * host yet (nobody signed in has started a stream) the page is only noted:
   * the host is spawned by the first start and connects every page then.
   */
  public attach(page: WebContents): void {
    const id = page.id;
    if (!this.pages.has(id)) {
      this.pages.set(id, page);
      page.once("destroyed", () => {
        this.pages.delete(id);
        this.started.delete(id);
        this.child?.postMessage({ type: "sender-gone", senderId: id } satisfies StreamHostRequest);
      });
    }
    this.connect(page);
  }

  public async start(kind: StreamKind, page: WebContents, accessToken: string): Promise<void> {
    if (!this.pages.has(page.id)) {
      this.attach(page);
    }
    // Recorded before the answer, so a stop that overtakes it still wins.
    let kinds = this.started.get(page.id);
    if (!kinds) {
      kinds = new Set();
      this.started.set(page.id, kinds);
    }
    kinds.add(kind);

    const id = this.nextRequestId++;
    const answered = new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.post({ type: "start", id, kind, senderId: page.id, accessToken });
    try {
      await answered;
    } catch (error) {
      this.started.get(page.id)?.delete(kind);
      throw error;
    }
  }

  public stop(kind: StreamKind, senderId: number): void {
    this.started.get(senderId)?.delete(kind);
    // No host, no socket to stop.
    this.child?.postMessage({ type: "stop", kind, senderId } satisfies StreamHostRequest);
  }

  public stopAll(): void {
    this.started.clear();
    this.child?.postMessage({ type: "stop-all" } satisfies StreamHostRequest);
  }

  public probe(): void {
    this.child?.postMessage({ type: "probe" } satisfies StreamHostRequest);
  }

  /** On quit: the host goes with the app and is not restarted. */
  public dispose(): void {
    this.disposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  private post(message: StreamHostRequest): void {
    (this.child ?? this.spawn()).postMessage(message);
  }

  private connect(page: WebContents): void {
    if (!this.child || page.isDestroyed()) {
      return;
    }
    const { port1, port2 } = new MessageChannelMain();
    this.child.postMessage({ type: "attach", senderId: page.id } satisfies StreamHostRequest, [port1]);
    page.postMessage(STREAM_PORT_CHANNEL, null, [port2]);
  }

  private spawn(): UtilityProcess {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = utilityProcess.fork(this.modulePath, [this.backendBaseUrl], {
      serviceName: "Connect streams",
    });
    this.child = child;
    this.spawnedAt = Date.now();
    child.on("message", (reply: StreamHostReply) => this.settle(reply));
    child.once("exit", (code) => this.onExit(child, code));
    // A new host has no ports yet; messages posted before it is up are queued.
    for (const page of this.pages.values()) {
      this.connect(page);
    }
    return child;
  }

  private settle(reply: StreamHostReply): void {
    const request = this.pending.get(reply.id);
    if (!request) {
      return;
    }
    this.pending.delete(reply.id);
    if (reply.error) {
      // Rebuilt as the class withAccessToken tests: a 401 here refreshes the
      // token and starts again, as it did when the socket was opened in main.
      request.reject(new DesktopApiError(reply.error.code, reply.error.statusCode, reply.error.message));
    } else {
      request.resolve();
    }
  }

  private onExit(child: UtilityProcess, code: number): void {
    if (this.child !== child) {
      return;
    }
    this.child = null;
    console.warn(`[stream-host] exited with code ${code}`);

    // A start in flight fails like a connection that could not be made, which
    // sends the renderer down its usual backoff.
    const error = new DesktopApiError("STREAM_WS_CONNECTION_ERROR", 503, "stream host exited");
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();

    // Every socket went with it. Each page hears that the way it hears a socket
    // closing, and its reconnect starts the stream again on the next host.
    const at = new Date().toISOString();
    for (const [pageId, kinds] of this.started) {
      const page = this.pages.get(pageId);
      if (!page || page.isDestroyed()) {
        continue;
      }
      for (const kind of kinds) {
        page.send(STREAM_EVENT_CHANNELS[kind], {
          type: "stream-status",
          status: "closed",
          detail: "stream host exited",
          at,
        });
      }
    }
    this.started.clear();

    if (this.disposed) {
      return;
    }
    this.quickExits = Date.now() - this.spawnedAt < STABLE_RUN_MS ? this.quickExits + 1 : 0;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.child && !this.disposed) {
        this.spawn();
      }
    }, restartDelayMs(this.quickExits));
  }
}
