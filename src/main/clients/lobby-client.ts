import type { LobbyDescriptor } from "../../shared/auth-contracts";
import type { BaseClient } from "./base-client";

export class LobbyClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async listLobbies(
    accessToken: string,
  ): Promise<{ lobbies: LobbyDescriptor[] }> {
    return this.baseClient.request<{ lobbies: LobbyDescriptor[] }>("/lobby/rooms", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async createLobby(
    accessToken: string,
    name: string,
  ): Promise<{ lobby: LobbyDescriptor }> {
    return this.baseClient.request<{ lobby: LobbyDescriptor }>("/lobby/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name }),
    });
  }

  public async updateLobby(
    accessToken: string,
    lobbyId: string,
    name: string,
  ): Promise<{ lobby: LobbyDescriptor }> {
    const encodedLobbyID = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ lobby: LobbyDescriptor }>(
      `/lobby/rooms/${encodedLobbyID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name }),
      },
    );
  }

  public async deleteLobby(
    accessToken: string,
    lobbyId: string,
  ): Promise<{ deleted: boolean; lobbyId: string }> {
    const encodedLobbyID = encodeURIComponent(lobbyId);
    return this.baseClient.request<{ deleted: boolean; lobbyId: string }>(
      `/lobby/rooms/${encodedLobbyID}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async joinLobby(
    accessToken: string,
    lobbyId: string,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>("/lobby/join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ lobbyId }),
    });
  }

  public async leaveLobby(
    accessToken: string,
    lobbyId?: string,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>(
      "/lobby/leave",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(lobbyId ? { lobbyId } : {}),
      },
    );
  }

  public async setLobbyMuted(
    accessToken: string,
    lobbyId: string,
    muted: boolean,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>("/lobby/mute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ lobbyId, muted }),
    });
  }

  public async setLobbyDeafened(
    accessToken: string,
    lobbyId: string,
    deafened: boolean,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>(
      "/lobby/deafen",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ lobbyId, deafened }),
      },
    );
  }

  public async setLobbyCameraEnabled(
    accessToken: string,
    lobbyId: string,
    enabled: boolean,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>(
      "/lobby/camera",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ lobbyId, enabled }),
      },
    );
  }

  public async setLobbyScreenSharing(
    accessToken: string,
    lobbyId: string,
    enabled: boolean,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>(
      "/lobby/screen",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ lobbyId, enabled }),
      },
    );
  }

  public async getLobbyState(
    accessToken: string,
    lobbyId: string,
  ): Promise<{
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
  }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.baseClient.request<{
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
    }>(`/lobby/state?lobbyId=${encodedLobbyId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async listLobbyStates(accessToken: string): Promise<{
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
  }> {
    return this.baseClient.request<{
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
    }>("/lobby/states", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}
