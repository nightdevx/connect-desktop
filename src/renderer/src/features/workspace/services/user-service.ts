import type {
  DesktopResult,
  UserDirectoryStreamEvent,
} from "../../../../../shared/desktop-api-types";
import type {
  UserDirectoryEntry,
} from "../../../../../shared/auth-contracts";

const desktopBridgeOutdatedError = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

const userDirectoryEventFallback: UserDirectoryStreamEvent = {
  type: "system-error",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

export const userService = {
  getRegisteredUsers: (): Promise<
    DesktopResult<{ users: UserDirectoryEntry[] }>
  > => {
    return window.desktopApi.getRegisteredUsers();
  },
  startUserDirectoryStream: () => {
    if (typeof window.desktopApi.startUserDirectoryStream !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ started: boolean }>,
      );
    }

    return window.desktopApi.startUserDirectoryStream();
  },
  stopUserDirectoryStream: () => {
    if (typeof window.desktopApi.stopUserDirectoryStream !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ stopped: boolean }>,
      );
    }

    return window.desktopApi.stopUserDirectoryStream();
  },
  onUserDirectoryEvent: (
    listener: (event: UserDirectoryStreamEvent) => void,
  ) => {
    if (typeof window.desktopApi.onUserDirectoryEvent !== "function") {
      listener(userDirectoryEventFallback);
      return () => undefined;
    }

    return window.desktopApi.onUserDirectoryEvent(listener);
  },
  setWindowAttention: (payload: { enabled: boolean }) => {
    if (typeof window.desktopApi.setWindowAttention !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ attention: boolean }>,
      );
    }

    return window.desktopApi.setWindowAttention(payload);
  },
  initiateCall: (payload: { targetUserId: string }) => {
    if (typeof window.desktopApi.initiateCall !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ callId: string }>,
      );
    }
    return window.desktopApi.initiateCall(payload);
  },
  acceptCall: (payload: { callId: string; callerId: string }) => {
    if (typeof window.desktopApi.acceptCall !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ ok: boolean }>,
      );
    }
    return window.desktopApi.acceptCall(payload);
  },
  rejectCall: (payload: { callId: string; callerId: string }) => {
    if (typeof window.desktopApi.rejectCall !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ ok: boolean }>,
      );
    }
    return window.desktopApi.rejectCall(payload);
  },
  cancelCall: (payload: { callId: string; targetUserId: string }) => {
    if (typeof window.desktopApi.cancelCall !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ ok: boolean }>,
      );
    }
    return window.desktopApi.cancelCall(payload);
  },
};

export default userService;

