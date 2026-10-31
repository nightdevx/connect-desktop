import { join } from "node:path";
import { BrowserWindow } from "electron";
import { BackendClient, DesktopApiError } from "../backend-client";
import { backendBaseUrl } from "../config";
import { StreamHostClient } from "./stream-host-client";
import { SessionStore } from "../session-store";
import { isSessionFatal, redeemRefreshToken } from "../auth-failure";
import { isAccessTokenExpired, isAccessTokenExpiring } from "../access-token";
import { rememberedPresence } from "../presence-memory";
import type { UserProfile } from "../../shared/auth-contracts";
import type { ApiErrorPayload, DesktopResult, SessionSnapshot } from "../../shared/desktop-api-types";

export const backendClient = new BackendClient(backendBaseUrl);
let sessionStore: SessionStore | null = null;

// Puts the account's last status back on the server before a stream socket
// opens, so the connect announces it instead of "online" (presence-memory.ts).
// "online" is what the server assumes anyway. Never holds a start up for long:
// a failure or a slow answer only costs the status, not the connection.
// ponytail: if the server's 12 s grace ends between this answer and the dial,
// the connect still says "online"; a re-send after the start would close that.
let presenceRestore: Promise<void> | null = null;
const restorePresence = (accessToken: string): Promise<void> => {
  const userId = getSessionStore().get()?.user.id;
  const status = userId ? rememberedPresence(userId) : null;
  if (!status || status === "online") {
    return Promise.resolve();
  }
  // The three streams start together: one request for all of them.
  presenceRestore ??= Promise.race([
    backendClient.auth.setPresence(accessToken, status).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
  ]).finally(() => {
    presenceRestore = null;
  });
  return presenceRestore;
};

// A status the user picks while a restore is on its way waits for it, or the
// restore could land second and put the old status back.
export const presenceRestored = (): Promise<void> => presenceRestore ?? Promise.resolve();

// The renderer's three streams on one socket (/ws), or on three per-stream
// sockets for a backend that predates it (stream-hub.ts). They run in a utility
// process, not here; this is main's handle on it (stream-host-client.ts).
export const streamHub = new StreamHostClient(
  join(__dirname, "../stream-host-process.js"),
  backendBaseUrl,
  restorePresence,
);

export const getWindowFromSender = (sender: Electron.WebContents): BrowserWindow => {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win) {
    throw new DesktopApiError("WINDOW_NOT_FOUND", 404, "Window not found");
  }

  return win;
};

export const getSessionStore = (): SessionStore => {
  if (!sessionStore) {
    sessionStore = new SessionStore();
  }

  return sessionStore;
};

export const toErrorPayload = (error: unknown): ApiErrorPayload => {
  if (error instanceof DesktopApiError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      ...error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
      statusCode: 500,
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    message: "Unexpected desktop error",
    statusCode: 500,
  };
};

export const ok = <T>(data: T): DesktopResult<T> => ({ ok: true, data });

export const fail = <T>(error: unknown): DesktopResult<T> => ({
  ok: false,
  error: toErrorPayload(error),
});

export const getSessionSnapshot = (): SessionSnapshot => {
  const current = getSessionStore().get();
  if (!current) {
    return { authenticated: false, user: null };
  }

  return { authenticated: true, user: current.user };
};

export const persistAuthResult = (result: {
  user: UserProfile;
  tokens: { accessToken: string; refreshToken: string };
}): void => {
  getSessionStore().set({
    user: result.user,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
  });
};

// Single-flight token refresh.
//
// Refresh tokens are single-use server-side: redeeming one consumes it and
// issues a new pair. Every 401 handler used to read the same stored token and
// POST /auth/refresh independently, so when the access token expired the many
// parallel IPC calls the renderer makes (lobby-state every 8s, lobby-messages
// every 30s, the session query, user list, DM lists) all raced. One won; the
// rest got 401 back — and desktop:auth-session treats a 401 as "session
// invalid" and clears the store, so a losing racer wiped a session a sibling
// call had just successfully refreshed and dumped the user to the login screen
// mid-call.
let refreshInFlight: Promise<void> | null = null;

export const SESSION_EXPIRED_CHANNEL = "desktop:session-expired";
export const EMAIL_VERIFICATION_REQUIRED_CHANNEL = "desktop:email-verification-required";

// With an email-domain allowlist on, an account whose address is unverified is
// refused everything but /auth/me, the two verification steps, refresh and
// logout, sockets included. Whichever request meets that first tells every
// window, which puts the verification screen in front of the workspace.
const reportIfVerificationRequired = (error: unknown): void => {
  if (error instanceof DesktopApiError && error.code === "EMAIL_VERIFICATION_REQUIRED") {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(EMAIL_VERIFICATION_REQUIRED_CHANNEL);
      }
    }
  }
};


// Ends the session everywhere at once, and tells the renderer.
//
// Until this existed, a dead refresh token was only ever discovered by whichever
// IPC call happened to be in flight. That call returned the backend's raw
// English error to its own call site and nothing else happened: the tokens
// stayed on disk, the three websocket managers kept reconnecting with them, and
// the renderer — which has no 401 interceptor and only re-reads the session on
// mount — left the whole workspace mounted behind an authentication that no
// longer existed. The user saw "refresh token is invalid or already used" in a
// toast and could keep clicking through lobbies, DMs and settings.
export const endSession = (reason: string, bannedUntil?: string): void => {
  if (!getSessionStore().get()) {
    // Already ended. Do not broadcast a second time — the renderer would
    // re-announce an expiry the user has already been told about.
    return;
  }

  getSessionStore().clear();
  streamHub.stopAll();

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SESSION_EXPIRED_CHANNEL, { reason, bannedUntil });
    }
  }
};

const refreshSession = async (): Promise<void> => {
  if (refreshInFlight) {
    // Someone else is already refreshing; ride along with their result.
    return refreshInFlight;
  }

  const current = getSessionStore().get();
  if (!current) {
    throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
  }

  refreshInFlight = redeemRefreshToken(() => backendClient.auth.refresh(current.refreshToken))
    .then((refreshed) => {
      persistAuthResult(refreshed);
    })
    .catch((error: unknown) => {
      if (isSessionFatal(error)) {
        endSession(
          error instanceof DesktopApiError ? error.code : "UNAUTHORIZED",
          error instanceof DesktopApiError ? error.details?.bannedUntil : undefined,
        );
      }

      // Callers still see the failure; ending the session is in addition to
      // reporting it, not instead of.
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

// Read the token back from the store rather than from a local variable, so a
// caller that piggy-backed on someone else's refresh still gets the new one.
const currentAccessToken = (): string => {
  const current = getSessionStore().get();
  if (!current) {
    throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
  }
  return current.accessToken;
};

export const ensureFreshSession = async (): Promise<void> => {
  const current = getSessionStore().get();
  if (!current) {
    return;
  }

  try {
    const me = await backendClient.auth.getMe(current.accessToken);
    getSessionStore().set({ ...getSessionStore().get()!, user: me.user });
  } catch (error) {
    if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
      throw error;
    }

    await refreshSession();
  }
};

export const withAccessToken = async <T>(
  operation: (accessToken: string) => Promise<T>,
): Promise<T> => {
  try {
    return await withFreshAccessToken(operation);
  } catch (error) {
    reportIfVerificationRequired(error);
    throw error;
  }
};

const withFreshAccessToken = async <T>(
  operation: (accessToken: string) => Promise<T>,
): Promise<T> => {
  const current = getSessionStore().get();
  if (!current) {
    throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
  }

  // Refresh before the request rather than after the 401.
  //
  // The token's own `exp` is right there, so waiting to be told is a round trip
  // spent to learn something already known — and the renderer runs several
  // queries in parallel, so an expiry meant a burst of 401s all queueing behind
  // one refresh before any of them could retry. Every 15 minutes, that landed on
  // whatever the user was doing at the time.
  if (isAccessTokenExpiring(current.accessToken, Date.now())) {
    try {
      await refreshSession();
    } catch (error) {
      // A refresh that failed on the network is not a reason to abandon a token
      // that still has seconds left; let the request try, and let the 401 path
      // below be the backstop it always was. Only a genuinely dead token is
      // fatal here.
      if (isAccessTokenExpired(current.accessToken, Date.now())) {
        throw error;
      }
    }
  }

  try {
    return await operation(currentAccessToken());
  } catch (error) {
    if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
      throw error;
    }

    await refreshSession();
    return operation(currentAccessToken());
  }
};
