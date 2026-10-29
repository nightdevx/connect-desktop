import { DesktopApiError } from "./clients/base-client";

// Re-exported so the self-check builds errors from the same class this module
// tests against — instanceof across two copies is silently always false.
export { DesktopApiError };

// The two rules that decide how an authentication failure is treated. Both are
// one-liners, and both fail in a way nothing reports:
//
//   * isSessionFatal too broad signs the user out on a train-tunnel timeout;
//     too narrow leaves the app mounted behind a session that no longer exists.
//   * statusFromSocketError deciding "not 401" means the socket layer never
//     refreshes and retries with an expired token until the user restarts.
//
// They live in their own module, importing nothing but the error class, so a
// self-check can exercise them without pulling in electron.

// A failure the server will never accept a retry for. Anything else — a
// timeout, an unreachable backend, a 5xx — is transient.
export const isSessionFatal = (error: unknown): boolean =>
  error instanceof DesktopApiError &&
  (error.statusCode === 401 ||
    error.code === "USER_BANNED" ||
    error.code === "ACCOUNT_DEACTIVATED");

// `ws` reports a rejected upgrade as a plain error whose message carries the
// HTTP status and nothing else. Unknown shapes fall back to 503, the transport
// failure this used to report unconditionally.
export const statusFromSocketError = (message: string | undefined): number => {
  const match = /Unexpected server response: (\d{3})/.exec(message ?? "");
  return match ? Number(match[1]) : 503;
};

// The server's answer to two refreshes of one token at once: the other one
// consumed it a moment ago and has not linked its successor yet, and asking
// again shortly after is answered with that successor (tokens.go). Up to ~5 s,
// well inside the server's 10 s window.
const REFRESH_IN_PROGRESS_RETRY_MS = [500, 1_000, 1_500, 2_000];

export const redeemRefreshToken = async <T>(
  redeem: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await redeem();
    } catch (error) {
      const delay = REFRESH_IN_PROGRESS_RETRY_MS[attempt];
      if (
        delay === undefined ||
        !(error instanceof DesktopApiError) ||
        error.code !== "REFRESH_IN_PROGRESS"
      ) {
        throw error;
      }
      await wait(delay);
    }
  }
};
