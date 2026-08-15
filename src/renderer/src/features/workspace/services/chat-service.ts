import type {
  ChatAttachmentUpload,
  DesktopResult,
  DirectMessagesStreamEvent,
} from "../../../../../shared/desktop-api-types";
import type {
  ChatMessage,
  FriendEntry,
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
  code: "DESKTOP_BRIDGE_OUTDATED",
  message:
    "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
};

export const chatService = {
  listLobbyMessages: (payload: { lobbyId: string; limit?: number }) => {
    return window.desktopApi.listLobbyMessages(payload);
  },
  sendLobbyMessage: (payload: {
    lobbyId: string;
    body: string;
    replyToId?: string;
    attachment?: ChatAttachmentUpload;
  }) => {
    return window.desktopApi.sendLobbyMessage(payload);
  },
  searchLobbyMessages: (payload: {
    lobbyId: string;
    query: string;
    limit?: number;
  }): Promise<DesktopResult<{ messages: ChatMessage[] }>> => {
    if (typeof window.desktopApi.searchLobbyMessages !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.searchLobbyMessages(payload);
  },
  searchDirectMessages: (payload: {
    peerUserId: string;
    query: string;
    limit?: number;
  }): Promise<DesktopResult<{ messages: ChatMessage[] }>> => {
    if (typeof window.desktopApi.searchDirectMessages !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.searchDirectMessages(payload);
  },
  editChatMessage: (payload: {
    messageId: string;
    body: string;
  }): Promise<DesktopResult<{ message: ChatMessage }>> => {
    if (typeof window.desktopApi.editChatMessage !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.editChatMessage(payload);
  },
  setChatReaction: (payload: {
    messageId: string;
    emoji: string;
    add: boolean;
  }): Promise<DesktopResult<{ message: ChatMessage }>> => {
    if (typeof window.desktopApi.setChatReaction !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.setChatReaction(payload);
  },
  getChatAttachment: (payload: { attachmentId: string }) => {
    if (typeof window.desktopApi.getChatAttachment !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          dataUrl: string;
          mimeType: string;
          size: number;
        }>,
      );
    }

    return window.desktopApi.getChatAttachment(payload);
  },
  saveChatAttachment: (payload: { attachmentId: string; fileName: string }) => {
    if (typeof window.desktopApi.saveChatAttachment !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          saved: boolean;
          path?: string;
        }>,
      );
    }

    return window.desktopApi.saveChatAttachment(payload);
  },
  // A posted GIF lives at a remote URL rather than in an attachment row, so it
  // has its own save path. Main re-checks the host before fetching.
  saveChatImage: (payload: { url: string }) => {
    if (typeof window.desktopApi.saveChatImage !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          saved: boolean;
          path?: string;
        }>,
      );
    }

    return window.desktopApi.saveChatImage(payload);
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
  listConversations: (): Promise<
    DesktopResult<{ peerUserIds: string[]; conversations?: FriendEntry[] }>
  > => {
    if (typeof window.desktopApi.listConversations !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.listConversations();
  },
  listDirectMessages: (payload: {
    peerUserId: string;
    limit?: number;
    before?: string;
  }): Promise<DesktopResult<{ messages: ChatMessage[]; hasMore?: boolean }>> => {
    if (typeof window.desktopApi.listDirectMessages !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.listDirectMessages(payload);
  },
  markDirectRead: (payload: { peerUserId: string }) => {
    if (typeof window.desktopApi.markDirectRead !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ marked: boolean }>,
      );
    }

    return window.desktopApi.markDirectRead(payload);
  },
  getDirectUnreadCounts: (payload: { peerUserIds: string[] }) => {
    if (typeof window.desktopApi.getDirectUnreadCounts !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{
          unreadByPeerUserId: Record<string, number>;
        }>,
      );
    }

    return window.desktopApi.getDirectUnreadCounts(payload);
  },
  sendDirectMessage: (payload: {
    peerUserId: string;
    body: string;
    replyToId?: string;
    attachment?: ChatAttachmentUpload;
  }): Promise<DesktopResult<{ message: ChatMessage }>> => {
    if (typeof window.desktopApi.sendDirectMessage !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.sendDirectMessage(payload);
  },
  sendDirectTyping: (payload: { peerUserId: string }) => {
    if (typeof window.desktopApi.sendDirectTyping !== "function") {
      return Promise.resolve(
        desktopBridgeOutdatedError as DesktopResult<{ sent: boolean }>,
      );
    }

    return window.desktopApi.sendDirectTyping(payload);
  },
  startDirectMessagesStream: () => {
    if (typeof window.desktopApi.startDirectMessagesStream !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.startDirectMessagesStream();
  },
  stopDirectMessagesStream: () => {
    if (typeof window.desktopApi.stopDirectMessagesStream !== "function") {
      return Promise.resolve(desktopBridgeOutdatedError);
    }

    return window.desktopApi.stopDirectMessagesStream();
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

