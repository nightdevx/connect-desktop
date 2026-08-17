import type { LobbyDescriptor } from "../../shared/auth-contracts";
import type { CustomEmoteSummary } from "../../shared/desktop-api-types";
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
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string,
    isTextOnly?: boolean,
  ): Promise<{ lobby: LobbyDescriptor }> {
    return this.baseClient.request<{ lobby: LobbyDescriptor }>("/lobby/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      // isTextOnly is create-only: there is no edit path for it, so updateLobby
      // deliberately does not carry it.
      body: JSON.stringify({ name, isLocked, allowedUsers, password, isTextOnly }),
    });
  }

  public async updateLobby(
    accessToken: string,
    lobbyId: string,
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
  ): Promise<{ lobby: LobbyDescriptor }> {
    const encodedLobbyID = encodeURIComponent(lobbyId);
    // password: undefined -> omit (keep current); string ("" clears) -> send.
    const body: Record<string, unknown> = { name, isLocked, allowedUsers };
    if (password !== undefined) {
      body.password = password;
    }
    return this.baseClient.request<{ lobby: LobbyDescriptor }>(
      `/lobby/rooms/${encodedLobbyID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
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
    password?: string,
  ): Promise<{ accepted: boolean; lobbyId: string }> {
    return this.baseClient.request<{ accepted: boolean; lobbyId: string }>("/lobby/join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ lobbyId, password }),
    });
  }

  public async kickLobbyMember(
    accessToken: string,
    lobbyId: string,
    userId: string,
  ): Promise<{ kicked: boolean }> {
    const room = encodeURIComponent(lobbyId);
    const target = encodeURIComponent(userId);
    return this.baseClient.request<{ kicked: boolean }>(
      `/media/livekit/lobbies/${room}/kick/${target}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async muteLobbyMember(
    accessToken: string,
    lobbyId: string,
    userId: string,
    muted: boolean,
  ): Promise<{ muted: boolean }> {
    const room = encodeURIComponent(lobbyId);
    const target = encodeURIComponent(userId);
    return this.baseClient.request<{ muted: boolean }>(
      `/media/livekit/lobbies/${room}/mute/${target}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ muted }),
      },
    );
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

  // The emote id is validated server-side against a closed set; nothing here
  // needs to know what the sounds are.
  public async sendLobbyEmote(
    accessToken: string,
    lobbyId: string,
    emote: string,
  ): Promise<{ accepted: boolean }> {
    return this.baseClient.request<{ accepted: boolean }>(
      `/lobby/rooms/${encodeURIComponent(lobbyId)}/emote`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ emote }),
      },
    );
  }

  // The uploaded soundboard. Listing carries no audio — see the sample call
  // below, which is the one that moves bytes and is read once per id.
  public async listEmotes(
    accessToken: string,
  ): Promise<{ emotes: CustomEmoteSummary[]; quota: number; used: number }> {
    return this.baseClient.request(`/lobby/emotes`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async getEmoteSample(
    accessToken: string,
    emoteId: string,
  ): Promise<{ id: string; name: string; mimeType: string; dataUrl: string }> {
    return this.baseClient.request(
      `/lobby/emotes/${encodeURIComponent(emoteId)}/sample`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async uploadEmote(
    accessToken: string,
    name: string,
    dataUrl: string,
  ): Promise<{ emote: CustomEmoteSummary; quota: number; used: number }> {
    return this.baseClient.request(
      `/lobby/emotes`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, dataUrl }),
      },
      // A 400 KB body on a slow uplink is not a hung request; the default 8s
      // budget is sized for control-plane calls.
      30_000,
    );
  }

  public async deleteEmote(
    accessToken: string,
    emoteId: string,
  ): Promise<{ deleted: boolean }> {
    return this.baseClient.request(
      `/lobby/emotes/${encodeURIComponent(emoteId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
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
      serverMuted: boolean;
      deafened: boolean;

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
        serverMuted: boolean;
        deafened: boolean;
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
        serverMuted: boolean;
        deafened: boolean;
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
          serverMuted: boolean;
          deafened: boolean;

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
