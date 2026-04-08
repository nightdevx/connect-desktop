import { app, BrowserWindow, desktopCapturer, ipcMain } from "electron";
import { BackendClient, DesktopApiError } from "../backend-client";
import { backendBaseUrl } from "../config";
import { DirectMessagesStreamManager } from "./direct-messages-stream-manager";
import { LobbyStreamManager } from "./lobby-stream-manager";
import { UserDirectoryStreamManager } from "./user-directory-stream-manager";
import { SessionStore } from "../session-store";
import {
  checkForAppUpdates,
  getAppUpdateSnapshot,
  installDownloadedAppUpdate,
} from "../update";
import type {
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserProfile,
} from "../../shared/auth-contracts";
import type {
  ApiErrorPayload,
  DesktopResult,
  SessionSnapshot,
} from "../../shared/desktop-api-types";

const backendClient = new BackendClient(backendBaseUrl);
let sessionStore: SessionStore | null = null;
const directMessagesStreamManager = new DirectMessagesStreamManager(
  backendBaseUrl,
);
const lobbyStreamManager = new LobbyStreamManager(backendBaseUrl);
const userDirectoryStreamManager = new UserDirectoryStreamManager(
  backendBaseUrl,
);

const getWindowFromSender = (sender: Electron.WebContents): BrowserWindow => {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win) {
    throw new DesktopApiError("WINDOW_NOT_FOUND", 404, "Window not found");
  }

  return win;
};

const getSessionStore = (): SessionStore => {
  if (!sessionStore) {
    sessionStore = new SessionStore();
  }

  return sessionStore;
};

const toErrorPayload = (error: unknown): ApiErrorPayload => {
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

const ok = <T>(data: T): DesktopResult<T> => ({ ok: true, data });

const fail = <T>(error: unknown): DesktopResult<T> => ({
  ok: false,
  error: toErrorPayload(error),
});

const IPC_INVOKE_CHANNELS = [
  "app:ping",
  "app:get-version",
  "desktop:get-version",
  "desktop:update-check",
  "desktop:update-install",
  "desktop:update-state",
  "desktop:auth-register",
  "desktop:auth-change-password",
  "desktop:auth-login",
  "desktop:auth-logout",
  "desktop:auth-session",
  "desktop:auth-profile",
  "desktop:auth-profile-update",
  "desktop:auth-users",
  "desktop:user-directory-stream-start",
  "desktop:user-directory-stream-stop",
  "desktop:lobbies-list",
  "desktop:lobbies-states",
  "desktop:lobbies-create",
  "desktop:lobbies-update",
  "desktop:lobbies-delete",
  "desktop:lobbies-join",
  "desktop:lobbies-leave",
  "desktop:lobbies-mute",
  "desktop:lobbies-deafen",
  "desktop:lobbies-camera",
  "desktop:lobbies-screen",
  "desktop:lobbies-stream-start",
  "desktop:lobbies-stream-stop",
  "desktop:livekit-token",
  "desktop:screen-capture-sources",
  "desktop:lobbies-state",
  "desktop:lobby-messages-list",
  "desktop:lobby-messages-send",
  "desktop:lobby-messages-delete",
  "desktop:direct-messages-list",
  "desktop:direct-messages-send",
  "desktop:direct-messages-start",
  "desktop:direct-messages-stop",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:window-attention",
  "desktop:window-state",
] as const;

const clearIpcInvokeHandlers = (): void => {
  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
};

const ensureObject = (
  value: unknown,
  field: string,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be an object`,
    );
  }

  return value as Record<string, unknown>;
};

const ensureValidString = (
  value: unknown,
  field: string,
  minLength: number,
  maxLength = 512,
): string => {
  if (typeof value !== "string") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be a string`,
    );
  }

  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be at least ${minLength} chars`,
    );
  }

  if (trimmed.length > maxLength) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be at most ${maxLength} chars`,
    );
  }

  return trimmed;
};

const ensureNullableString = (
  value: unknown,
  field: string,
  maxLength: number,
): string | null => {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be a string`,
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      `${field} must be at most ${maxLength} chars`,
    );
  }

  return trimmed;
};

const parseLoginPayload = (payload: unknown): LoginRequest => {
  const source = ensureObject(payload, "login payload");
  return {
    username: ensureValidString(source.username, "username", 3, 64),
    password: ensureValidString(source.password, "password", 8, 256),
  };
};

const parseRegisterPayload = (payload: unknown): RegisterRequest => {
  const source = ensureObject(payload, "register payload");
  return {
    username: ensureValidString(source.username, "username", 3, 64),
    password: ensureValidString(source.password, "password", 8, 256),
  };
};

const parseChangePasswordPayload = (
  payload: unknown,
): { currentPassword: string; newPassword: string } => {
  const source = ensureObject(payload, "change password payload");
  return {
    currentPassword: ensureValidString(
      source.currentPassword,
      "currentPassword",
      8,
      256,
    ),
    newPassword: ensureValidString(source.newPassword, "newPassword", 8, 256),
  };
};

const parseUpdateProfilePayload = (payload: unknown): UpdateProfileRequest => {
  const source = ensureObject(payload, "update profile payload");

  return {
    displayName: ensureValidString(source.displayName, "displayName", 3, 32),
    email: ensureNullableString(source.email, "email", 128),
    bio: ensureNullableString(source.bio, "bio", 240),
    avatarUrl: ensureNullableString(source.avatarUrl, "avatarUrl", 700000),
  };
};

const parseCreateLobbyPayload = (payload: unknown): { name: string } => {
  const source = ensureObject(payload, "create lobby payload");
  return {
    name: ensureValidString(source.name, "name", 2, 64),
  };
};

const parseUpdateLobbyPayload = (
  payload: unknown,
): { lobbyId: string; name: string } => {
  const source = ensureObject(payload, "update lobby payload");
  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
    name: ensureValidString(source.name, "name", 2, 64),
  };
};

const parseDeleteLobbyPayload = (payload: unknown): { lobbyId: string } => {
  const source = ensureObject(payload, "delete lobby payload");
  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
  };
};

const parseLobbyJoinPayload = (payload: unknown): { lobbyId: string } => {
  const source = ensureObject(payload, "lobby join payload");
  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
  };
};

const parseLobbyStatePayload = (payload: unknown): { lobbyId: string } => {
  const source = ensureObject(payload, "lobby state payload");
  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
  };
};

const parseLobbyMessagesListPayload = (
  payload: unknown,
): { lobbyId: string; limit: number } => {
  const source = ensureObject(payload, "lobby messages list payload");
  const lobbyId = ensureValidString(source.lobbyId, "lobbyId", 2, 128);

  let limit = 80;
  if (typeof source.limit === "number" && Number.isFinite(source.limit)) {
    const parsed = Math.floor(source.limit);
    if (parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  return { lobbyId, limit };
};

const parseLobbyMessageSendPayload = (
  payload: unknown,
): { lobbyId: string; body: string } => {
  const source = ensureObject(payload, "lobby message send payload");
  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
    body: ensureValidString(source.body, "body", 1, 1200),
  };
};

const parseLobbyMessageDeletePayload = (
  payload: unknown,
): { messageId: string } => {
  const source = ensureObject(payload, "lobby message delete payload");
  return {
    messageId: ensureValidString(source.messageId, "messageId", 2, 128),
  };
};

const parseLobbyLeavePayload = (payload: unknown): { lobbyId?: string } => {
  if (payload == null) {
    return {};
  }

  const source = ensureObject(payload, "lobby leave payload");
  if (source.lobbyId == null) {
    return {};
  }

  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
  };
};

const parseLobbyMutePayload = (
  payload: unknown,
): { lobbyId: string; muted: boolean } => {
  const source = ensureObject(payload, "lobby mute payload");

  if (typeof source.muted !== "boolean") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "muted must be a boolean",
    );
  }

  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
    muted: source.muted,
  };
};

const parseLobbyDeafenPayload = (
  payload: unknown,
): { lobbyId: string; deafened: boolean } => {
  const source = ensureObject(payload, "lobby deafen payload");

  if (typeof source.deafened !== "boolean") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "deafened must be a boolean",
    );
  }

  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
    deafened: source.deafened,
  };
};

const parseLobbyEnabledPayload = (
  payload: unknown,
  field: string,
): { lobbyId: string; enabled: boolean } => {
  const source = ensureObject(payload, `${field} payload`);

  if (typeof source.enabled !== "boolean") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "enabled must be a boolean",
    );
  }

  return {
    lobbyId: ensureValidString(source.lobbyId, "lobbyId", 2, 128),
    enabled: source.enabled,
  };
};

const parseLiveKitTokenPayload = (payload: unknown): { room?: string } => {
  if (payload == null) {
    return {};
  }

  const source = ensureObject(payload, "livekit token payload");
  if (source.room == null) {
    return {};
  }

  return {
    room: ensureValidString(source.room, "room", 2, 128),
  };
};

const parseDirectMessagesListPayload = (
  payload: unknown,
): { peerUserId: string; limit: number } => {
  const source = ensureObject(payload, "direct messages list payload");
  const peerUserId = ensureValidString(source.peerUserId, "peerUserId", 2, 128);

  let limit = 80;
  if (typeof source.limit === "number" && Number.isFinite(source.limit)) {
    const parsed = Math.floor(source.limit);
    if (parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  return { peerUserId, limit };
};

const parseSendDirectMessagePayload = (
  payload: unknown,
): { peerUserId: string; body: string } => {
  const source = ensureObject(payload, "send direct message payload");
  return {
    peerUserId: ensureValidString(source.peerUserId, "peerUserId", 2, 128),
    body: ensureValidString(source.body, "body", 1, 1200),
  };
};

const parseDirectMessagesStreamStartPayload = (
  payload: unknown,
): { peerUserId: string } => {
  const source = ensureObject(payload, "direct messages stream start payload");
  return {
    peerUserId: ensureValidString(source.peerUserId, "peerUserId", 2, 128),
  };
};

const parseDirectMessagesStreamStopPayload = (
  payload: unknown,
): { peerUserId: string | null } => {
  if (payload == null) {
    return { peerUserId: null };
  }

  const source = ensureObject(payload, "direct messages stream stop payload");
  if (source.peerUserId == null) {
    return { peerUserId: null };
  }

  return {
    peerUserId: ensureValidString(source.peerUserId, "peerUserId", 2, 128),
  };
};

const parseWindowAttentionPayload = (
  payload: unknown,
): { enabled: boolean } => {
  const source = ensureObject(payload, "window attention payload");
  if (typeof source.enabled !== "boolean") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "enabled must be a boolean",
    );
  }

  return {
    enabled: source.enabled,
  };
};

const getSessionSnapshot = (): SessionSnapshot => {
  const current = getSessionStore().get();
  if (!current) {
    return { authenticated: false, user: null };
  }

  return { authenticated: true, user: current.user };
};

const persistAuthResult = (result: {
  user: UserProfile;
  tokens: { accessToken: string; refreshToken: string };
}): void => {
  getSessionStore().set({
    user: result.user,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
  });
};

const ensureFreshSession = async (): Promise<void> => {
  const current = getSessionStore().get();
  if (!current) {
    return;
  }

  try {
    const me = await backendClient.getMe(current.accessToken);
    getSessionStore().set({ ...current, user: me.user });
  } catch (error) {
    if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
      throw error;
    }

    const refreshed = await backendClient.refresh(current.refreshToken);
    persistAuthResult(refreshed);
  }
};

const withAccessToken = async <T>(
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

    const refreshed = await backendClient.refresh(current.refreshToken);
    persistAuthResult(refreshed);
    return operation(refreshed.tokens.accessToken);
  }
};

export async function cleanupBeforeAppQuit(): Promise<void> {
  directMessagesStreamManager.stopAll();
  lobbyStreamManager.stopAll();
  userDirectoryStreamManager.stopAll();

  const current = getSessionStore().get();
  if (!current) {
    return;
  }

  try {
    await withAccessToken((accessToken) => {
      return backendClient.leaveLobby(accessToken);
    });
  } catch {
    // Best-effort cleanup; app shutdown should continue even if backend is unreachable.
  }
}

export function registerIpcHandlers(): void {
  // Electron dev reload can invoke this multiple times in the same process.
  // Remove previous handlers to keep registration idempotent.
  clearIpcInvokeHandlers();

  ipcMain.handle("app:ping", async () => "pong");
  ipcMain.handle("app:get-version", async () => app.getVersion());
  ipcMain.handle("desktop:get-version", async () => app.getVersion());

  ipcMain.handle("desktop:update-check", async () => {
    try {
      const result = await checkForAppUpdates();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-install", async () => {
    try {
      const result = await installDownloadedAppUpdate();
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:update-state", async () => {
    try {
      const result = getAppUpdateSnapshot();
      return ok({ state: result });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-register", async (_event, payload: unknown) => {
    try {
      const parsed = parseRegisterPayload(payload);
      const result = await backendClient.register(parsed);
      persistAuthResult(result);
      return ok(getSessionSnapshot());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:auth-change-password",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseChangePasswordPayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.changePassword(accessToken, parsed);
        });

        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:auth-login", async (_event, payload: unknown) => {
    try {
      const parsed = parseLoginPayload(payload);
      const result = await backendClient.login(parsed);
      persistAuthResult(result);
      return ok(getSessionSnapshot());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-logout", async () => {
    directMessagesStreamManager.stopAll();
    lobbyStreamManager.stopAll();
    userDirectoryStreamManager.stopAll();

    getSessionStore().clear();
    return ok(getSessionSnapshot());
  });

  ipcMain.handle("desktop:auth-session", async () => {
    try {
      await ensureFreshSession();
      return ok(getSessionSnapshot());
    } catch (error) {
      if (error instanceof DesktopApiError && error.statusCode === 401) {
        getSessionStore().clear();
        return ok(getSessionSnapshot());
      }

      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-profile", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.getSettingsProfile(accessToken);
      });

      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:auth-profile-update",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseUpdateProfilePayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.updateSettingsProfile(accessToken, parsed);
        });

        const current = getSessionStore().get();
        if (current) {
          getSessionStore().set({
            ...current,
            user: {
              ...current.user,
              displayName: result.profile.displayName,
              avatarUrl: result.profile.avatarUrl,
            },
          });
        }

        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:auth-users", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.getRegisteredUsers(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:user-directory-stream-start", async (event) => {
    try {
      await ensureFreshSession();

      const current = getSessionStore().get();
      if (!current) {
        throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
      }

      const started = userDirectoryStreamManager.start(
        event.sender,
        current.accessToken,
      );

      return ok(started);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:user-directory-stream-stop", async (event) => {
    try {
      const stopped = userDirectoryStreamManager.stop(event.sender.id);
      return ok(stopped);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-list", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.listLobbies(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-states", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.listLobbyStates(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-create", async (_event, payload: unknown) => {
    try {
      const parsed = parseCreateLobbyPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.createLobby(accessToken, parsed.name);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-update", async (_event, payload: unknown) => {
    try {
      const parsed = parseUpdateLobbyPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.updateLobby(
          accessToken,
          parsed.lobbyId,
          parsed.name,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-delete", async (_event, payload: unknown) => {
    try {
      const parsed = parseDeleteLobbyPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.deleteLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-join", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyJoinPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.joinLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-leave", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyLeavePayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.leaveLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-mute", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyMutePayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.setLobbyMuted(
          accessToken,
          parsed.lobbyId,
          parsed.muted,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-deafen", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyDeafenPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.setLobbyDeafened(
          accessToken,
          parsed.lobbyId,
          parsed.deafened,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-camera", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyEnabledPayload(payload, "lobby camera");
      const result = await withAccessToken((accessToken) => {
        return backendClient.setLobbyCameraEnabled(
          accessToken,
          parsed.lobbyId,
          parsed.enabled,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-screen", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyEnabledPayload(payload, "lobby screen");
      const result = await withAccessToken((accessToken) => {
        return backendClient.setLobbyScreenSharing(
          accessToken,
          parsed.lobbyId,
          parsed.enabled,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:livekit-token", async (_event, payload: unknown) => {
    try {
      const parsed = parseLiveKitTokenPayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.createLiveKitToken(accessToken, parsed.room);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:screen-capture-sources", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        fetchWindowIcons: false,
        thumbnailSize: {
          width: 0,
          height: 0,
        },
      });

      const ordered = [...sources].sort((left, right) => {
        const leftIsScreen = left.id.startsWith("screen:");
        const rightIsScreen = right.id.startsWith("screen:");

        if (leftIsScreen !== rightIsScreen) {
          return leftIsScreen ? -1 : 1;
        }

        return left.name.localeCompare(right.name, "tr");
      });

      return ok({
        sources: ordered.map((source) => ({
          id: source.id,
          name:
            source.name ||
            (source.id.startsWith("screen:") ? "Ekran" : "Pencere"),
          kind: source.id.startsWith("screen:") ? "screen" : "window",
          displayId: source.display_id || null,
        })),
      });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-state", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyStatePayload(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.getLobbyState(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:lobby-messages-list",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseLobbyMessagesListPayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.listLobbyMessages(
            accessToken,
            parsed.lobbyId,
            parsed.limit,
          );
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:lobby-messages-send",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseLobbyMessageSendPayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.sendLobbyMessage(
            accessToken,
            parsed.lobbyId,
            parsed.body,
          );
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:lobby-messages-delete",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseLobbyMessageDeletePayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.deleteMessage(accessToken, parsed.messageId);
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:direct-messages-list",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseDirectMessagesListPayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.listDirectMessages(
            accessToken,
            parsed.peerUserId,
            parsed.limit,
          );
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:direct-messages-send",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseSendDirectMessagePayload(payload);
        const result = await withAccessToken((accessToken) => {
          return backendClient.sendDirectMessage(
            accessToken,
            parsed.peerUserId,
            parsed.body,
          );
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:lobbies-stream-start", async (event) => {
    try {
      await ensureFreshSession();

      const current = getSessionStore().get();
      if (!current) {
        throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
      }

      const started = lobbyStreamManager.start(
        event.sender,
        current.accessToken,
      );
      return ok(started);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-stream-stop", async (event) => {
    try {
      const result = lobbyStreamManager.stop(event.sender.id);
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:direct-messages-start",
    async (event, payload: unknown) => {
      try {
        const parsed = parseDirectMessagesStreamStartPayload(payload);
        await ensureFreshSession();

        const current = getSessionStore().get();
        if (!current) {
          throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
        }

        const started = directMessagesStreamManager.start(
          event.sender,
          parsed.peerUserId,
          current.accessToken,
        );

        return ok(started);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:direct-messages-stop",
    async (event, payload: unknown) => {
      try {
        const parsed = parseDirectMessagesStreamStopPayload(payload);
        const result = directMessagesStreamManager.stop(
          event.sender.id,
          parsed.peerUserId ?? undefined,
        );
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:window-minimize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.minimize();
      return ok({ minimized: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:window-toggle-maximize", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }

      return ok({ isMaximized: win.isMaximized() });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:window-close", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      win.close();
      return ok({ closed: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "desktop:window-attention",
    async (event, payload: unknown) => {
      try {
        const parsed = parseWindowAttentionPayload(payload);
        const win = getWindowFromSender(event.sender);
        win.flashFrame(parsed.enabled);
        return ok({ attention: parsed.enabled });
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle("desktop:window-state", async (event) => {
    try {
      const win = getWindowFromSender(event.sender);
      return ok({ isMaximized: win.isMaximized() });
    } catch (error) {
      return fail(error);
    }
  });
}
