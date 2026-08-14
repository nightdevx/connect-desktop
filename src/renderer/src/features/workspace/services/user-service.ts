import type {
  DesktopNotificationRequest,
  DesktopResult,
  UserDirectoryStreamEvent,
} from "../../../../../shared/desktop-api-types";
import type {
  FriendRequestLists,
  PrivacySettings,
  SelectablePresenceStatus,
  UpdatePrivacyRequest,
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
  listBlockedUsers: () => {
    if (typeof window.desktopApi.listBlockedUsers !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          blockedUserIds: string[];
        }>,
      );
    }

    return window.desktopApi.listBlockedUsers();
  },
  blockUser: (payload: { userId: string }) => {
    if (typeof window.desktopApi.blockUser !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ blocked: boolean }>,
      );
    }

    return window.desktopApi.blockUser(payload);
  },
  unblockUser: (payload: { userId: string }) => {
    if (typeof window.desktopApi.unblockUser !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ unblocked: boolean }>,
      );
    }

    return window.desktopApi.unblockUser(payload);
  },
  listFriends: () => {
    if (typeof window.desktopApi.listFriends !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          friendUserIds: string[];
        }>,
      );
    }

    return window.desktopApi.listFriends();
  },
  listFriendRequests: () => {
    if (typeof window.desktopApi.listFriendRequests !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<FriendRequestLists>,
      );
    }

    return window.desktopApi.listFriendRequests();
  },
  sendFriendRequest: (payload: { username: string }) => {
    if (typeof window.desktopApi.sendFriendRequest !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          requested: boolean;
          accepted: boolean;
        }>,
      );
    }

    return window.desktopApi.sendFriendRequest(payload);
  },
  acceptFriendRequest: (payload: { userId: string }) => {
    if (typeof window.desktopApi.acceptFriendRequest !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ accepted: boolean }>,
      );
    }

    return window.desktopApi.acceptFriendRequest(payload);
  },
  // Unfriend, reject and cancel are the same call: one edge, one delete.
  removeFriend: (payload: { userId: string }) => {
    if (typeof window.desktopApi.removeFriend !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ removed: boolean }>,
      );
    }

    return window.desktopApi.removeFriend(payload);
  },
  getPrivacySettings: () => {
    if (typeof window.desktopApi.getPrivacySettings !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          privacy: PrivacySettings;
        }>,
      );
    }

    return window.desktopApi.getPrivacySettings();
  },
  updatePrivacySettings: (payload: UpdatePrivacyRequest) => {
    if (typeof window.desktopApi.updatePrivacySettings !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          privacy: PrivacySettings;
        }>,
      );
    }

    return window.desktopApi.updatePrivacySettings(payload);
  },
  setPresence: (payload: { status: SelectablePresenceStatus }) => {
    if (typeof window.desktopApi.setPresence !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          presence: SelectablePresenceStatus;
        }>,
      );
    }

    return window.desktopApi.setPresence(payload);
  },
  // The main process decides whether a toast is actually raised (preference off
  // or window focused = no toast), so callers can fire and forget.
  notify: (payload: DesktopNotificationRequest) => {
    if (typeof window.desktopApi.notify !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ shown: boolean }>,
      );
    }

    return window.desktopApi.notify(payload);
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

