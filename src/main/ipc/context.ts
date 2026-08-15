import { BrowserWindow } from "electron";
import { BackendClient, DesktopApiError } from "../backend-client";
import { backendBaseUrl } from "../config";
import { DirectMessagesStreamManager } from "./direct-messages-stream-manager";
import { LobbyStreamManager } from "./lobby-stream-manager";
import { UserDirectoryStreamManager } from "./user-directory-stream-manager";
import { SessionStore } from "../session-store";
import { isSessionFatal } from "../auth-failure";
import type { UserProfile } from "../../shared/auth-contracts";
import type { ApiErrorPayload, DesktopResult, SessionSnapshot } from "../../shared/desktop-api-types";

export const backendClient = new BackendClient(backendBaseUrl);
let sessionStore: SessionStore | null = null;
export const directMessagesStreamManager = new DirectMessagesStreamManager(backendBaseUrl);
export const lobbyStreamManager = new LobbyStreamManager(backendBaseUrl);
export const userDirectoryStreamManager = new UserDirectoryStreamManager(backendBaseUrl);

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
export const endSession = (reason: string): void => {
  if (!getSessionStore().get()) {
    // Already ended. Do not broadcast a second time — the renderer would
    // re-announce an expiry the user has already been told about.
    return;
  }

  getSessionStore().clear();
  directMessagesStreamManager.stopAll();
  lobbyStreamManager.stopAll();
  userDirectoryStreamManager.stopAll();

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SESSION_EXPIRED_CHANNEL, { reason });
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

  refreshInFlight = backendClient.auth
    .refresh(current.refreshToken)
    .then((refreshed) => {
      persistAuthResult(refreshed);
    })
    .catch((error: unknown) => {
      if (isSessionFatal(error)) {
        endSession(
          error instanceof DesktopApiError ? error.code : "UNAUTHORIZED",
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
  const current = getSessionStore().get();
  if (!current) {
    throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
  }

  try {
    return await operation(current.accessToken);
  } catch (error) {
    if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
      throw error;
    }

    await refreshSession();
    return operation(currentAccessToken());
  }
};
