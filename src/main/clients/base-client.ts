import { net } from "electron";

export interface ErrorResponse {
  code?: string;
  error?: string;
  message?: string;
}

// Every request goes through Chromium's network stack, not Node's.
//
// Node's global fetch is undici, whose default agent drops an idle connection
// after 4 seconds. This app's control-plane calls are spaced further apart than
// that almost by definition — the roster backstop is 8s, lobby messages 30s, a
// click is whenever the user clicks — so nearly every request was paying for a
// fresh TCP connect and TLS handshake to a remote HTTPS backend.
//
// Measured against the production backend from inside Electron:
//
//   undici     cold 259ms | 9s idle 100ms | 20s idle  95ms
//   net.fetch  cold 363ms | 9s idle  39ms | 20s idle  32ms | 35s idle 38ms
//
// Chromium keeps the (HTTP/2) session alive across those gaps, so the steady
// state is one round trip instead of a handshake plus a round trip: ~60ms off
// every call the user waits on. It also brings the system proxy, the OS
// certificate store and Chromium's DNS cache along with it.
//
// no-store because these are API responses: react-query owns caching, and the
// disk cache has no business holding a roster or a message list.
const requestInit = (init: RequestInit): RequestInit & {
  bypassCustomProtocolHandlers?: boolean;
} => ({
  ...init,
  cache: "no-store",
  // The backend is plain https. Nothing here should ever be answerable by a
  // protocol handler this app registered.
  bypassCustomProtocolHandlers: true,
});

export class DesktopApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export class BaseClient {
  public constructor(private readonly baseUrl: string) {}

  // timeoutMs is overridable because the default is sized for small
  // control-plane calls; a send carrying a 5 MB base64 attachment legitimately
  // takes longer than 8s on a slow uplink and must not be aborted as "hung".
  public async request<T>(
    path: string,
    init: RequestInit,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const targetUrl = `${this.baseUrl}${path}`;

    // Bound every request so a hung socket can't stall reconnect/join chains
    // indefinitely; timeout surfaces as a retryable error for the backoff logic.
    //
    // The timeout has to cover the BODY, not just the headers. fetch resolves
    // as soon as headers arrive, and clearing the timer there left
    // `await response.json()` streaming with no deadline — a captive portal or
    // a proxy that flushes headers then stalls left the IPC handler awaiting
    // forever, and the lobby reconnect guard (set before the call, cleared only
    // in .finally) stayed true for the rest of the session, so the lobby could
    // never reconnect again.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // A caller-supplied signal used to REPLACE ours, silently disabling the
    // timeout. Honour both.
    if (init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      const response = await net.fetch(
        targetUrl,
        requestInit({
          ...init,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
        }),
      );

      if (!response.ok) {
        const payload = (await this.tryParseJson(
          response,
        )) as ErrorResponse | null;
        throw new DesktopApiError(
          payload?.code ?? "REQUEST_FAILED",
          response.status,
          payload?.message ?? payload?.error ?? "Backend istegi basarisiz",
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      // A DesktopApiError from the !response.ok branch above is already the
      // shape callers expect; do not rewrap it as a transport failure.
      if (error instanceof DesktopApiError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new DesktopApiError(
          "REQUEST_TIMEOUT",
          504,
          `Backend istegi zaman asimina ugradi (${targetUrl})`,
        );
      }

      const reason = error instanceof Error ? error.message : "fetch failed";
      throw new DesktopApiError(
        "BACKEND_UNREACHABLE",
        503,
        `Backend baglantisi kurulamadi (${targetUrl}): ${reason}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // requestBinary is request() for endpoints that answer bytes rather than
  // JSON (currently only chat attachment downloads).
  //
  // It gets its own, much longer deadline: the shared 8s budget is sized for
  // small control-plane calls, and a 5 MB file over a slow link legitimately
  // takes longer than that.
  public async requestBinary(
    path: string,
    init: RequestInit,
    timeoutMs = 60_000,
  ): Promise<{ mimeType: string; bytes: Buffer }> {
    const targetUrl = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await net.fetch(
        targetUrl,
        requestInit({
          ...init,
          signal: controller.signal,
          headers: { ...(init.headers ?? {}) },
        }),
      );

      if (!response.ok) {
        const payload = (await this.tryParseJson(
          response,
        )) as ErrorResponse | null;
        throw new DesktopApiError(
          payload?.code ?? "REQUEST_FAILED",
          response.status,
          payload?.message ?? payload?.error ?? "Dosya indirilemedi",
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        mimeType:
          response.headers.get("content-type") ?? "application/octet-stream",
        bytes: buffer,
      };
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new DesktopApiError(
          "REQUEST_TIMEOUT",
          504,
          `Dosya indirme zaman asimina ugradi (${targetUrl})`,
        );
      }

      const reason = error instanceof Error ? error.message : "fetch failed";
      throw new DesktopApiError(
        "BACKEND_UNREACHABLE",
        503,
        `Backend baglantisi kurulamadi (${targetUrl}): ${reason}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async tryParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
