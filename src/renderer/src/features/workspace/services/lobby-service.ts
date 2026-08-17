import type {
  CustomEmoteSummary,
  DesktopResult,
  LobbySoundEmote,
  LobbyStreamEvent,
} from "@shared/desktop-api-types";
import type {
  LobbyDescriptor,
  LobbyTimeout,
} from "@shared/auth-contracts";

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
          serverMuted: boolean;
          deafened: boolean;

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
              serverMuted: boolean;
              deafened: boolean;
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
    isLocked?: boolean;
    allowedUsers?: string[];
    password?: string;
    isTextOnly?: boolean;
  }): Promise<DesktopResult<{ lobby: LobbyDescriptor }>> => {
    return window.desktopApi.createLobby(payload);
  },
  updateLobby: (payload: { lobbyId: string; name: string; isLocked?: boolean; allowedUsers?: string[]; password?: string | null }) => {
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
  joinLobby: (payload: { lobbyId: string; password?: string }) => {
    return window.desktopApi.joinLobby(payload);
  },
  kickLobbyMember: (payload: { lobbyId: string; userId: string }) => {
    if (typeof window.desktopApi.kickLobbyMember !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ kicked: boolean }>,
      );
    }
    return window.desktopApi.kickLobbyMember(payload);
  },
  timeoutLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
    durationSeconds?: number;
  }) => {
    if (typeof window.desktopApi.timeoutLobbyMember !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ banned: boolean }>,
      );
    }
    return window.desktopApi.timeoutLobbyMember(payload);
  },
  clearLobbyTimeout: (payload: { lobbyId: string; userId: string }) => {
    if (typeof window.desktopApi.clearLobbyTimeout !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ unbanned: boolean }>,
      );
    }
    return window.desktopApi.clearLobbyTimeout(payload);
  },
  listLobbyTimeouts: (payload: { lobbyId: string }) => {
    if (typeof window.desktopApi.listLobbyTimeouts !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ bans: LobbyTimeout[] }>,
      );
    }
    return window.desktopApi.listLobbyTimeouts(payload);
  },
  muteLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
    muted: boolean;
    durationSeconds?: number;
  }) => {
    if (typeof window.desktopApi.muteLobbyMember !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ muted: boolean }>,
      );
    }
    return window.desktopApi.muteLobbyMember(payload);
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
  sendLobbyEmote: (payload: {
    lobbyId: string;
    emote: LobbySoundEmote | string;
  }) => {
    if (typeof window.desktopApi.sendLobbyEmote !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ accepted: boolean }>,
      );
    }

    return window.desktopApi.sendLobbyEmote(payload);
  },
  listEmotes: () => {
    if (typeof window.desktopApi.listEmotes !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          emotes: CustomEmoteSummary[];
          quota: number;
          used: number;
        }>,
      );
    }

    return window.desktopApi.listEmotes();
  },
  getEmoteSample: (payload: { emoteId: string }) => {
    if (typeof window.desktopApi.getEmoteSample !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          id: string;
          name: string;
          mimeType: string;
          dataUrl: string;
        }>,
      );
    }

    return window.desktopApi.getEmoteSample(payload);
  },
  uploadEmote: (payload: { name: string; dataUrl: string }) => {
    if (typeof window.desktopApi.uploadEmote !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          emote: CustomEmoteSummary;
          quota: number;
          used: number;
        }>,
      );
    }

    return window.desktopApi.uploadEmote(payload);
  },
  deleteEmote: (payload: { emoteId: string }) => {
    if (typeof window.desktopApi.deleteEmote !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ deleted: boolean }>,
      );
    }

    return window.desktopApi.deleteEmote(payload);
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

