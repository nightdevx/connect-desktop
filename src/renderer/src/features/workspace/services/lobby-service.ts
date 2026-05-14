import type {
  DesktopResult,
  LobbyStreamEvent,
} from "../../../../../shared/desktop-api-types";
import type {
  LobbyDescriptor,
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

const lobbyStreamEventFallback: LobbyStreamEvent = {
  type: "system-error",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

export const lobbyService = {
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
  getLobbyState: (payload: { lobbyId: string }) => {
    return window.desktopApi.getLobbyState(payload);
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
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.listScreenCaptureSources();
  },
};

export default lobbyService;

