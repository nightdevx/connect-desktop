import type {
  DesktopResult,
  LobbyStreamEvent,
  DirectMessagesStreamEvent,
  UserDirectoryStreamEvent,
} from "../../../shared/desktop-api-types";
import type {
  ChatMessage,
  LobbyDescriptor,
  UserDirectoryEntry,
} from "../../../shared/auth-contracts";

const desktopBridgeOutdatedError = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

const directMessagesEventFallback: DirectMessagesStreamEvent = {
  type: "system-error",
  peerUserId: "",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

const lobbyStreamEventFallback: LobbyStreamEvent = {
  type: "system-error",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

const userDirectoryEventFallback: UserDirectoryStreamEvent = {
  type: "system-error",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

export const workspaceService = {
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
  listLobbies: (): Promise<DesktopResult<{ lobbies: LobbyDescriptor[] }>> => {
    return window.desktopApi.listLobbies();
  },
  startLobbyStream: () => {
    if (typeof window.desktopApi.startLobbyStream !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ started: boolean }>,
      );
    }

    return window.desktopApi.startLobbyStream();
  },
  stopLobbyStream: () => {
    if (typeof window.desktopApi.stopLobbyStream !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ stopped: boolean }>,
      );
    }

    return window.desktopApi.stopLobbyStream();
  },
  onLobbyStreamEvent: (listener: (event: LobbyStreamEvent) => void) => {
    if (typeof window.desktopApi.onLobbyStreamEvent !== "function") {
      listener(lobbyStreamEventFallback);
      return () => undefined;
    }

    return window.desktopApi.onLobbyStreamEvent(listener);
  },
  getLobbyStates: (): Promise<
    DesktopResult<{
      lobbies: Array<{
        lobbyId: string;
        members: Array<{
          userId: string;
          username: string;
          joinedAt: string;
          muted: boolean;
          deafened: boolean;
          speaking: boolean;
          cameraEnabled: boolean;
          screenSharing: boolean;
        }>;
        size: number;
        revision: number;
      }>;
    }>
  > => {
    if (typeof window.desktopApi.getLobbyStates !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          lobbies: Array<{
            lobbyId: string;
            members: Array<{
              userId: string;
              username: string;
              joinedAt: string;
              muted: boolean;
              deafened: boolean;
              speaking: boolean;
              cameraEnabled: boolean;
              screenSharing: boolean;
            }>;
            size: number;
            revision: number;
          }>;
        }>,
      );
    }

    return window.desktopApi.getLobbyStates();
  },
  createLobby: (payload: {
    name: string;
  }): Promise<DesktopResult<{ lobby: LobbyDescriptor }>> => {
    return window.desktopApi.createLobby(payload);
  },
  updateLobby: (payload: { lobbyId: string; name: string }) => {
    if (typeof window.desktopApi.updateLobby !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ lobby: LobbyDescriptor }>,
      );
    }

    return window.desktopApi.updateLobby(payload);
  },
  deleteLobby: (payload: { lobbyId: string }) => {
    if (typeof window.desktopApi.deleteLobby !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          deleted: boolean;
          lobbyId: string;
        }>,
      );
    }

    return window.desktopApi.deleteLobby(payload);
  },
  joinLobby: (payload: { lobbyId: string }) => {
    return window.desktopApi.joinLobby(payload);
  },
  leaveLobby: (payload?: { lobbyId?: string }) => {
    return window.desktopApi.leaveLobby(payload);
  },
  setLobbyMuted: (payload: { lobbyId: string; muted: boolean }) => {
    return window.desktopApi.setLobbyMuted(payload);
  },
  setLobbyDeafened: (payload: { lobbyId: string; deafened: boolean }) => {
    return window.desktopApi.setLobbyDeafened(payload);
  },
  setLobbyCameraEnabled: (payload: { lobbyId: string; enabled: boolean }) => {
    if (typeof window.desktopApi.setLobbyCameraEnabled !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          accepted: boolean;
          lobbyId: string;
        }>,
      );
    }

    return window.desktopApi.setLobbyCameraEnabled(payload);
  },
  setLobbyScreenSharing: (payload: { lobbyId: string; enabled: boolean }) => {
    if (typeof window.desktopApi.setLobbyScreenSharing !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          accepted: boolean;
          lobbyId: string;
        }>,
      );
    }

    return window.desktopApi.setLobbyScreenSharing(payload);
  },
  createLiveKitToken: (payload?: { room?: string }) => {
    if (typeof window.desktopApi.createLiveKitToken !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.createLiveKitToken(payload);
  },
  listScreenCaptureSources: () => {
    if (typeof window.desktopApi.listScreenCaptureSources !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          sources: {
            id: string;
            name: string;
            kind: "screen" | "window";
            displayId: string | null;
          }[];
        }>,
      );
    }

    return window.desktopApi.listScreenCaptureSources();
  },
  getLobbyState: (payload: { lobbyId: string }) => {
    return window.desktopApi.getLobbyState(payload);
  },
  listLobbyMessages: (payload: { lobbyId: string; limit?: number }) => {
    return window.desktopApi.listLobbyMessages(payload);
  },
  sendLobbyMessage: (payload: { lobbyId: string; body: string }) => {
    return window.desktopApi.sendLobbyMessage(payload);
  },
  deleteChatMessage: (payload: { messageId: string }) => {
    if (typeof window.desktopApi.deleteLobbyMessage !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          deleted: boolean;
          messageId: string;
        }>,
      );
    }

    return window.desktopApi.deleteLobbyMessage(payload);
  },
  deleteLobbyMessage: (payload: { messageId: string }) => {
    return workspaceService.deleteChatMessage(payload);
  },
  listDirectMessages: (payload: {
    peerUserId: string;
    limit?: number;
  }): Promise<DesktopResult<{ messages: ChatMessage[] }>> => {
    if (typeof window.desktopApi.listDirectMessages !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.listDirectMessages(payload);
  },
  sendDirectMessage: (payload: {
    peerUserId: string;
    body: string;
  }): Promise<DesktopResult<{ message: ChatMessage }>> => {
    if (typeof window.desktopApi.sendDirectMessage !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.sendDirectMessage(payload);
  },
  startDirectMessagesStream: (payload: { peerUserId: string }) => {
    if (typeof window.desktopApi.startDirectMessagesStream !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.startDirectMessagesStream(payload);
  },
  stopDirectMessagesStream: (payload?: { peerUserId?: string }) => {
    if (typeof window.desktopApi.stopDirectMessagesStream !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.stopDirectMessagesStream(payload);
  },
  onDirectMessagesEvent: (
    listener: (event: DirectMessagesStreamEvent) => void,
  ) => {
    if (typeof window.desktopApi.onDirectMessagesEvent !== "function") {
      listener(directMessagesEventFallback);
      return () => undefined;
    }

    return window.desktopApi.onDirectMessagesEvent(listener);
  },
  setWindowAttention: (payload: { enabled: boolean }) => {
    if (typeof window.desktopApi.setWindowAttention !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ attention: boolean }>,
      );
    }

    return window.desktopApi.setWindowAttention(payload);
  },
};

export default workspaceService;
