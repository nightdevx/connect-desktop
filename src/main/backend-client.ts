import type {
  AuthResponse,
  ChatMessage,
  ChangePasswordRequest,
  LobbyDescriptor,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
} from "../shared/auth-contracts";

interface ErrorResponse {
  code?: string;
  error?: string;
  message?: string;
}

export class DesktopApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}

export class BackendClient {
  public constructor(private readonly baseUrl: string) {}

  public async register(payload: RegisterRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async login(payload: LoginRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async refresh(refreshToken: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  public async changePassword(
    accessToken: string,
    payload: ChangePasswordRequest,
  ): Promise<{ changed: boolean }> {
    return this.request<{ changed: boolean }>("/auth/change-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getMe(accessToken: string): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>("/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async getSettingsProfile(
    accessToken: string,
  ): Promise<{ profile: UserSettingsProfile }> {
    return this.request<{ profile: UserSettingsProfile }>("/auth/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async updateSettingsProfile(
    accessToken: string,
    payload: UpdateProfileRequest,
  ): Promise<{ profile: UserSettingsProfile }> {
    return this.request<{ profile: UserSettingsProfile }>("/auth/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getRegisteredUsers(
    accessToken: string,
  ): Promise<{ users: UserDirectoryEntry[] }> {
    return this.request<{ users: UserDirectoryEntry[] }>("/auth/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async listLobbies(
    accessToken: string,
  ): Promise<{ lobbies: LobbyDescriptor[] }> {
    return this.request<{ lobbies: LobbyDescriptor[] }>("/lobby/rooms", {
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
    return this.request<{ lobby: LobbyDescriptor }>("/lobby/rooms", {
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
    return this.request<{ lobby: LobbyDescriptor }>(
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
    return this.request<{ deleted: boolean; lobbyId: string }>(
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
    return this.request<{ accepted: boolean; lobbyId: string }>("/lobby/join", {
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
    return this.request<{ accepted: boolean; lobbyId: string }>(
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
    return this.request<{ accepted: boolean; lobbyId: string }>("/lobby/mute", {
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
    return this.request<{ accepted: boolean; lobbyId: string }>(
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
    return this.request<{ accepted: boolean; lobbyId: string }>(
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
    return this.request<{ accepted: boolean; lobbyId: string }>(
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

  public async createLiveKitToken(
    accessToken: string,
    room?: string,
  ): Promise<{
    serverUrl: string;
    room: string;
    identity: string;
    name: string;
    token: string;
    expiresAt: string;
    mediaPolicy: {
      qualityProfile: string;
      preferredVideoCodec: string;
      backupVideoCodec: string;
      cameraMaxBitrate: number;
      cameraMaxFps: number;
      screenMaxBitrate: number;
      screenMaxFps: number;
      simulcast: boolean;
      dynacast: boolean;
    };
  }> {
    const payload = room ? { room } : {};
    return this.request<{
      serverUrl: string;
      room: string;
      identity: string;
      name: string;
      token: string;
      expiresAt: string;
      mediaPolicy: {
        qualityProfile: string;
        preferredVideoCodec: string;
        backupVideoCodec: string;
        cameraMaxBitrate: number;
        cameraMaxFps: number;
        screenMaxBitrate: number;
        screenMaxFps: number;
        simulcast: boolean;
        dynacast: boolean;
      };
    }>("/media/livekit/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
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
    return this.request<{
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
    return this.request<{
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

  public async listLobbyMessages(
    accessToken: string,
    lobbyId: string,
    limit = 80,
  ): Promise<{ messages: ChatMessage[] }> {
    const encodedLobbyId = encodeURIComponent(lobbyId);
    return this.request<{ messages: ChatMessage[] }>(
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
    return this.request<{ message: ChatMessage }>(
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
    return this.request<{ deleted: boolean; messageId: string }>(
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
    return this.request<{ messages: ChatMessage[] }>(
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
    return this.request<{ message: ChatMessage }>(
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

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const targetUrl = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(targetUrl, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "fetch failed";
      throw new DesktopApiError(
        "BACKEND_UNREACHABLE",
        503,
        `Backend baglantisi kurulamadi (${targetUrl}): ${reason}`,
      );
    }

    if (!response.ok) {
      const payload = (await this.tryParseJson(
        response,
      )) as ErrorResponse | null;
      throw new DesktopApiError(
        payload?.code ?? "REQUEST_FAILED",
        response.status,
        payload?.message ?? payload?.error ?? "Backend istegi basarisiz",
      );
    }

    return (await response.json()) as T;
  }

  private async tryParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
