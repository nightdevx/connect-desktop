import type {
  DesktopResult,
  DirectMessagesStreamEvent,
} from "../../../../../shared/desktop-api-types";
import type {
  ChatMessage,
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

const directMessagesEventFallback: DirectMessagesStreamEvent = {
  type: "system-error",
  peerUserId: "",
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

export const chatService = {
  listLobbyMessages: (payload: { lobbyId: string; limit?: number }) => {
    return window.desktopApi.listLobbyMessages(payload);
  },
  sendLobbyMessage: (payload: { lobbyId: string; body: string }) => {
    return window.desktopApi.sendLobbyMessage(payload);
  },
  deleteLobbyMessage: (payload: { messageId: string }) => {
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
  deleteChatMessage: (payload: { messageId: string }) => {
    return chatService.deleteLobbyMessage(payload);
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
};

export default chatService;

