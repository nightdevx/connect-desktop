import type { ChatMessage, FriendEntry } from "../../shared/auth-contracts";
import type { ChatAttachmentUpload } from "../../shared/desktop-api-types";
import type { BaseClient } from "./base-client";

// A send may carry a 5 MB attachment as base64. The client's default 8s budget
// is sized for small control-plane calls and would abort a legitimate upload on
// anything short of a fast link.
const SEND_TIMEOUT_MS = 60_000;

interface SendMessagePayload {
  body: string;
  replyToId?: string;
  attachment?: ChatAttachmentUpload;
}

export class ChatClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async listLobbyMessages(
    accessToken: string,
    lobbyId: string,
    limit = 80,
  ): Promise<{ messages: ChatMessage[] }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ messages: ChatMessage[] }>(
      `/chat/lobbies/${encodedLobbyId}/messages?limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async sendLobbyMessage(
    accessToken: string,
    lobbyId: string,
    payload: SendMessagePayload,
  ): Promise<{ message: ChatMessage }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/lobbies/${encodedLobbyId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );
  }

  public async searchLobbyMessages(
    accessToken: string,
    lobbyId: string,
    query: string,
    limit: number,
  ): Promise<{ messages: ChatMessage[] }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ messages: ChatMessage[] }>(
      `/chat/lobbies/${encodedLobbyId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async searchDirectMessages(
    accessToken: string,
    peerUserId: string,
    query: string,
    limit: number,
  ): Promise<{ messages: ChatMessage[] }> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    return this.baseClient.request<{ messages: ChatMessage[] }>(
      `/chat/direct/${encodedPeerUserId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async editMessage(
    accessToken: string,
    messageId: string,
    body: string,
  ): Promise<{ message: ChatMessage }> {
    const encodedMessageId = encodeURIComponent(messageId);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/messages/${encodedMessageId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ body }),
      },
    );
  }

  public async setReaction(
    accessToken: string,
    messageId: string,
    emoji: string,
    add: boolean,
  ): Promise<{ message: ChatMessage }> {
    const encodedMessageId = encodeURIComponent(messageId);
    const encodedEmoji = encodeURIComponent(emoji);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/messages/${encodedMessageId}/reactions/${encodedEmoji}`,
      {
        method: add ? "PUT" : "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async downloadAttachment(
    accessToken: string,
    attachmentId: string,
  ): Promise<{ mimeType: string; bytes: Buffer }> {
    const encodedAttachmentId = encodeURIComponent(attachmentId);
    return this.baseClient.requestBinary(
      `/chat/attachments/${encodedAttachmentId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  // Returns a data URL for inline rendering. The renderer has no network access
  // of its own and cannot attach the bearer token, so the bytes come through
  // IPC — which is also how avatars already work.
  public async fetchAttachment(
    accessToken: string,
    attachmentId: string,
  ): Promise<{ dataUrl: string; mimeType: string; size: number }> {
    const { mimeType, bytes } = await this.downloadAttachment(
      accessToken,
      attachmentId,
    );

    return {
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
      mimeType,
      size: bytes.byteLength,
    };
  }

  public async deleteMessage(
    accessToken: string,
    messageId: string,
  ): Promise<{ deleted: boolean; messageId: string }> {
    const encodedMessageID = encodeURIComponent(messageId);
    return this.baseClient.request<{ deleted: boolean; messageId: string }>(
      `/chat/messages/${encodedMessageID}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  // Named: the friends-only directory cannot label a stranger or a blocked
  // peer, so the sidebar takes their name from here. peerUserIds is kept for
  // an older backend that answers with ids alone.
  public async listConversations(
    accessToken: string,
  ): Promise<{ peerUserIds: string[]; conversations?: FriendEntry[] }> {
    return this.baseClient.request<{
      peerUserIds: string[];
      conversations?: FriendEntry[];
    }>(
      "/chat/conversations",
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // `before` is a message id: the page immediately older than it.
  public async listDirectMessages(
    accessToken: string,
    peerUserId: string,
    limit = 80,
    before?: string,
  ): Promise<{ messages: ChatMessage[]; hasMore?: boolean }> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    const beforeParam = before ? `&before=${encodeURIComponent(before)}` : "";
    return this.baseClient.request<{ messages: ChatMessage[]; hasMore?: boolean }>(
      `/chat/direct/${encodedPeerUserId}/messages?limit=${limit}${beforeParam}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async sendDirectMessage(
    accessToken: string,
    peerUserId: string,
    payload: SendMessagePayload,
  ): Promise<{ message: ChatMessage }> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/direct/${encodedPeerUserId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );
  }

  public async markDirectRead(
    accessToken: string,
    peerUserId: string,
  ): Promise<void> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    await this.baseClient.request<void>(
      `/chat/direct/${encodedPeerUserId}/read`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async getUnreadCounts(
    accessToken: string,
    peerUserIds: string[],
  ): Promise<{ unreadByPeerUserId: Record<string, number> }> {
    const query = peerUserIds
      .map((peerUserId) => `peerUserId=${encodeURIComponent(peerUserId)}`)
      .join("&");
    return this.baseClient.request<{
      unreadByPeerUserId: Record<string, number>;
    }>(`/chat/unread?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // Fire-and-forget: the server answers 204 and stores nothing.
  public async sendDirectTyping(
    accessToken: string,
    peerUserId: string,
  ): Promise<void> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    await this.baseClient.request<void>(
      `/chat/direct/${encodedPeerUserId}/typing`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }
}
