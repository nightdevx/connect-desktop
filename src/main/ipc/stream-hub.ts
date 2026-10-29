import WebSocket from "ws";
import { DesktopApiError } from "../clients/base-client";
import { awaitSocketOpen } from "./await-socket-open";
import { LobbyList } from "./lobby-list";
import { attachPictureUrls } from "../../shared/picture-urls";
import { STREAM_EVENT_CHANNELS, streamOfFrame, type StreamKind } from "./stream-frames";

export { STREAM_EVENT_CHANNELS, type StreamKind } from "./stream-frames";

/**
 * What the hub and the per-stream sockets need of a window. In the stream host
 * (stream-host.ts) this is the page's MessagePort, not its webContents: the
 * sockets live in a utility process, which has no webContents to send to.
 */
export interface StreamSender {
  readonly id: number;
  send: (channel: string, payload: unknown) => void;
  isDestroyed: () => boolean;
  once: (event: "destroyed", listener: () => void) => unknown;
}

// The server pings every 20s and gives up on us after 40s of silence; this is
// the backstop past both (see lobby-stream-manager.ts for how 35s went wrong).
const WATCHDOG_MS = 50_000;
// A stalled TCP connect or a proxy that never answers the upgrade fires no
// event at all; without a deadline the start never settles.
const HANDSHAKE_TIMEOUT_MS = 10_000;
// How long a probed socket has to answer before it is taken for dead.
export const PROBE_TIMEOUT_MS = 5_000;

/**
 * The three per-stream managers, for a backend that predates /ws. Each keeps
 * its own socket; the hub only routes start, stop and probe to them.
 */
export interface LegacyStreams {
  start: (kind: StreamKind, sender: StreamSender, accessToken: string) => Promise<void>;
  stop: (kind: StreamKind, senderId: number) => void;
  probe: () => void;
  stopAll: () => void;
  /**
   * Whether the backend itself is answering (GET /healthz). Only then is a 404
   * from /ws "this backend has no /ws": with the backend down, during a deploy
   * or an outage, the proxy in front of it answers 404 for every path.
   */
  backendAnswers: () => Promise<boolean>;
}

interface Session {
  sender: StreamSender;
  wanted: Set<StreamKind>;
  socket: WebSocket | null;
  opening: Promise<void> | null;
  watchdog?: NodeJS.Timeout;
  probeTimer?: NodeJS.Timeout;
  // Set when this hub closed the socket on purpose: its close is not news.
  closing: boolean;
  // The v2 room list and its seq, kept across reconnects so the next connect
  // resumes from where this one left off (lobby-list.ts).
  lobbies: LobbyList;
}

/**
 * One socket per window for the lobby, user directory and direct-message
 * streams.
 *
 * They were three sockets, each with its own reconnect schedule in the
 * renderer, so a network blip cost three TLS handshakes, three token checks and
 * three reconnects, and the server saw the account's presence flap three times.
 * The renderer still starts and stops each stream on its own; here a start
 * opens the shared socket or joins the one already opening, and a stop only
 * drops the stream from what is forwarded until nothing is wanted.
 *
 * A start never tears down a socket that is alive. It used to: every start
 * closed the stream's socket and dialled again, so "the network came back"
 * replaced a healthy connection. Liveness is asked with probe() instead.
 */
export class StreamHub {
  private readonly sessions = new Map<number, Session>();
  private readonly senderDestroyBound = new Set<number>();
  // Set once a backend that is up answers /ws with 404: it predates the
  // multiplexed socket, and the per-stream sockets are used for the rest of the
  // process.
  private legacyMode = false;

  public constructor(
    private readonly backendBaseUrl: string,
    private readonly legacy: LegacyStreams,
    // The desktop's own User-Agent, which `ws` does not send by itself. The
    // backend reads the build's version from it at the upgrade: from
    // core.DesktopPictureURLVersion on, the socket's profile events carry
    // picture versions instead of base64 (auth.PicturesByURL).
    private readonly userAgent = "",
  ) {}

  public isLegacy(): boolean {
    return this.legacyMode;
  }

  public async start(kind: StreamKind, sender: StreamSender, accessToken: string): Promise<void> {
    if (this.legacyMode) {
      return this.legacy.start(kind, sender, accessToken);
    }

    const session = this.sessionFor(sender);
    session.wanted.add(kind);

    if (session.socket?.readyState === WebSocket.OPEN) {
      // Joining a live socket: this stream is connected as of now. A page that
      // reloaded joins the socket its last load opened, and v2 sends nothing
      // until a room changes, so it is handed the list held here.
      this.emit(session, kind, { type: "stream-status", status: "connected", at: new Date().toISOString() });
      if (kind === "lobby" && session.lobbies.known) {
        this.emit(session, kind, session.lobbies.snapshot());
      }
      return;
    }

    if (!session.opening) {
      session.opening = this.open(session, accessToken)
        .catch(async (error: unknown) => {
          // Asked once per failed open, for every start waiting on it.
          if (
            error instanceof DesktopApiError &&
            error.statusCode === 404 &&
            (await this.legacy.backendAnswers())
          ) {
            this.legacyMode = true;
            this.forget(session);
          }
          throw error;
        })
        .finally(() => {
          session.opening = null;
        });
    }

    try {
      await session.opening;
    } catch (error) {
      if (this.legacyMode) {
        // A backend without /ws. Hand every stream this window wants to the
        // per-stream sockets; the other starts in flight land there too.
        return this.legacy.start(kind, sender, accessToken);
      }
      // A 404 with the backend down is an outage like any other: the
      // renderer's reconnect tries /ws again.
      throw error;
    }
  }

  public stop(kind: StreamKind, senderId: number): void {
    if (this.legacyMode) {
      this.legacy.stop(kind, senderId);
      return;
    }
    const session = this.sessions.get(senderId);
    if (!session) {
      return;
    }
    session.wanted.delete(kind);
    if (session.wanted.size === 0) {
      this.close(session);
    }
  }

  public stopAll(): void {
    for (const session of [...this.sessions.values()]) {
      this.close(session);
    }
    this.legacy.stopAll();
  }

  /**
   * Asks every open socket whether it is still there: the network came back,
   * or the machine woke. A socket that answers is kept; one that does not is
   * terminated, and its close sends the renderer down its normal reconnect.
   *
   * Waking from sleep leaves a socket that looks open and is not: nothing
   * arrives to say so until the watchdog fires, 50 seconds later.
   */
  public probe(): void {
    if (this.legacyMode) {
      this.legacy.probe();
      return;
    }
    for (const session of this.sessions.values()) {
      const socket = session.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN || session.probeTimer) {
        continue;
      }
      session.probeTimer = setTimeout(() => {
        session.probeTimer = undefined;
        socket.terminate();
      }, PROBE_TIMEOUT_MS);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }

  private sessionFor(sender: StreamSender): Session {
    let session = this.sessions.get(sender.id);
    if (!session) {
      session = { sender, wanted: new Set(), socket: null, opening: null, closing: false, lobbies: new LobbyList() };
      this.sessions.set(sender.id, session);
    }
    if (!this.senderDestroyBound.has(sender.id)) {
      this.senderDestroyBound.add(sender.id);
      sender.once("destroyed", () => {
        const current = this.sessions.get(sender.id);
        if (current) {
          this.close(current);
        }
        for (const kind of Object.keys(STREAM_EVENT_CHANNELS) as StreamKind[]) {
          this.legacy.stop(kind, sender.id);
        }
        this.senderDestroyBound.delete(sender.id);
      });
    }
    return session;
  }

  private async open(session: Session, accessToken: string): Promise<void> {
    const socket = new WebSocket(this.buildUrl(accessToken, session.lobbies.seq), {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      headers: this.userAgent ? { "User-Agent": this.userAgent } : undefined,
    });
    session.socket = socket;
    session.closing = false;

    const opened = awaitSocketOpen(socket, "STREAM_WS_CONNECTION_ERROR", "stream websocket");

    const heartbeat = (): void => {
      if (session.watchdog) {
        clearTimeout(session.watchdog);
      }
      if (session.probeTimer) {
        clearTimeout(session.probeTimer);
        session.probeTimer = undefined;
      }
      session.watchdog = setTimeout(() => {
        if (session.socket === socket && socket.readyState !== WebSocket.CLOSED) {
          socket.terminate();
        }
      }, WATCHDOG_MS);
    };

    let didOpen = false;
    socket.on("open", () => {
      didOpen = true;
      heartbeat();
      for (const kind of session.wanted) {
        this.emit(session, kind, { type: "stream-status", status: "connected", at: new Date().toISOString() });
      }
    });
    socket.on("ping", heartbeat);
    socket.on("pong", heartbeat);
    socket.on("message", (data) => {
      heartbeat();
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      if (!raw.trim()) {
        return;
      }
      let frame: { type?: unknown };
      try {
        frame = JSON.parse(raw) as { type?: unknown };
      } catch {
        return;
      }
      // The room list is kept here whether or not the page wants the lobby
      // stream right now: its seq has to follow every step this socket sees.
      if (frame.type === "lobbies-snapshot" || frame.type === "lobby-delta") {
        const list = session.lobbies.apply(frame as { type: string });
        if (list === "resync") {
          // A delta with no list under it. Dropping the socket reconnects
          // without since, which is answered with the whole list.
          socket.terminate();
          return;
        }
        frame = list;
      }
      // From core.DesktopPictureURLVersion on, a profile event names its
      // pictures by version (see shared/picture-urls.ts).
      if (frame.type === "user-profile-updated") {
        attachPictureUrls(frame);
      }
      const kind = typeof frame.type === "string" ? streamOfFrame(frame.type) : null;
      if (kind && session.wanted.has(kind)) {
        this.emit(session, kind, frame);
      }
    });
    socket.on("close", (code, reasonBuffer) => {
      if (session.watchdog) {
        clearTimeout(session.watchdog);
        session.watchdog = undefined;
      }
      if (session.probeTimer) {
        clearTimeout(session.probeTimer);
        session.probeTimer = undefined;
      }
      if (session.socket !== socket) {
        return;
      }
      session.socket = null;
      // Only a socket that was open can close. A dial that fails gets its
      // close from ws in the same tick as the error, before the rejection below
      // is handled, so the guard there came too late: every failed attempt
      // still announced "closed", and the renderer scheduled a second
      // reconnect on top of the one the rejection drives.
      if (session.closing || !didOpen) {
        return;
      }
      const reason = reasonBuffer.toString();
      for (const kind of session.wanted) {
        this.emit(session, kind, {
          type: "stream-status",
          status: "closed",
          detail: reason || `websocket closed (${code})`,
          // 1012 is the server restarting for a deploy: the renderer
          // reconnects at once instead of backing off.
          code,
          at: new Date().toISOString(),
        });
      }
    });
    // Errors surface through awaitSocketOpen before the open and as a close
    // after it; without a listener ws would throw them.
    socket.on("error", () => {});

    try {
      await opened;
    } catch (error) {
      // A socket that never opened must not announce a closure: the renderer's
      // reconnect is already driven by this rejection.
      if (session.socket === socket) {
        session.socket = null;
      }
      session.closing = true;
      try {
        socket.terminate();
      } catch {
        // Already gone.
      }
      // awaitSocketOpen carries the upgrade's HTTP status: 401 for the token
      // refresh in withAccessToken, 404 for start() to fall back on.
      throw error;
    }
  }

  private close(session: Session): void {
    session.closing = true;
    session.wanted.clear();
    if (session.watchdog) {
      clearTimeout(session.watchdog);
    }
    if (session.probeTimer) {
      clearTimeout(session.probeTimer);
    }
    const socket = session.socket;
    session.socket = null;
    this.sessions.delete(session.sender.id);
    try {
      socket?.close(1000, "client-stop");
    } catch {
      // no-op
    }
  }

  private forget(session: Session): void {
    this.sessions.delete(session.sender.id);
  }

  private emit(session: Session, kind: StreamKind, payload: unknown): void {
    if (session.sender.isDestroyed()) {
      return;
    }
    session.sender.send(STREAM_EVENT_CHANNELS[kind], payload);
  }

  private buildUrl(accessToken: string, lobbySeq: number | null): string {
    const url = new URL(this.backendBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.searchParams.set("access_token", accessToken);
    // The v2 room list (lobby-list.ts). A backend that predates it ignores
    // both and sends v1 snapshots, which LobbyList takes as they are.
    url.searchParams.set("proto", "2");
    if (lobbySeq !== null) {
      url.searchParams.set("since", String(lobbySeq));
    }
    return url.toString();
  }
}
