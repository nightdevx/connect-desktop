import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
} from "../../shared/auth-contracts";
import type { BaseClient } from "./base-client";

export class AuthClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async register(payload: RegisterRequest): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async login(payload: LoginRequest): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async refresh(refreshToken: string): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  public async changePassword(
    accessToken: string,
    payload: ChangePasswordRequest,
  ): Promise<{ changed: boolean }> {
    return this.baseClient.request<{ changed: boolean }>("/auth/change-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getMe(accessToken: string): Promise<{ user: UserProfile }> {
    return this.baseClient.request<{ user: UserProfile }>("/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async getSettingsProfile(
    accessToken: string,
  ): Promise<{ profile: UserSettingsProfile }> {
    return this.baseClient.request<{ profile: UserSettingsProfile }>("/auth/profile", {
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
    return this.baseClient.request<{ profile: UserSettingsProfile }>("/auth/profile", {
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
    return this.baseClient.request<{ users: UserDirectoryEntry[] }>("/auth/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}
