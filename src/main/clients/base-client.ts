export interface ErrorResponse {
  code?: string;
  error?: string;
  message?: string;
}

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
      const response = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

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
      const response = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
        headers: { ...(init.headers ?? {}) },
      });

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
