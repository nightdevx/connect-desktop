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

export class BaseClient {
  public constructor(private readonly baseUrl: string) {}

  public async request<T>(path: string, init: RequestInit): Promise<T> {
    const targetUrl = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(targetUrl, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "fetch failed";
      throw new DesktopApiError(
        "BACKEND_UNREACHABLE",
        503,
        `Backend baglantisi kurulamadi (${targetUrl}): ${reason}`,
      );
    }

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
  }

  private async tryParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
