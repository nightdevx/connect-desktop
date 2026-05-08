import { BrowserWindow } from "electron";
import { BackendClient, DesktopApiError } from "../backend-client";
import { backendBaseUrl } from "../config";
import { DirectMessagesStreamManager } from "./direct-messages-stream-manager";
import { LobbyStreamManager } from "./lobby-stream-manager";
import { UserDirectoryStreamManager } from "./user-directory-stream-manager";
import { SessionStore } from "../session-store";
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

export const ensureFreshSession = async (): Promise<void> => {
  const current = getSessionStore().get();
  if (!current) {
    return;
  }

  try {
    const me = await backendClient.auth.getMe(current.accessToken);
    getSessionStore().set({ ...current, user: me.user });
  } catch (error) {
    if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
      throw error;
    }

    const refreshed = await backendClient.auth.refresh(current.refreshToken);
    persistAuthResult(refreshed);
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

    const refreshed = await backendClient.auth.refresh(current.refreshToken);
    persistAuthResult(refreshed);
    return operation(refreshed.tokens.accessToken);
  }
};
