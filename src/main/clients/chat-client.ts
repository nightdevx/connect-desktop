import type { ChatMessage } from "../../shared/auth-contracts";
import type { BaseClient } from "./base-client";

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
    body: string,
  ): Promise<{ message: ChatMessage }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/lobbies/${encodedLobbyId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body }),
      },
    );
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

  public async listDirectMessages(
    accessToken: string,
    peerUserId: string,
    limit = 80,
  ): Promise<{ messages: ChatMessage[] }> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    return this.baseClient.request<{ messages: ChatMessage[] }>(
      `/chat/direct/${encodedPeerUserId}/messages?limit=${limit}`,
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
    body: string,
  ): Promise<{ message: ChatMessage }> {
    const encodedPeerUserId = encodeURIComponent(peerUserId);
    return this.baseClient.request<{ message: ChatMessage }>(
      `/chat/direct/${encodedPeerUserId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body }),
      },
    );
  }
}
