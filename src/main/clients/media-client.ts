import type { BaseClient } from "./base-client";

export class MediaClient {
  public constructor(private readonly baseClient: BaseClient) {}

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
  }> {
    const payload = room ? { room } : {};
    return this.baseClient.request<{
      serverUrl: string;
      room: string;
      identity: string;
      name: string;
      token: string;
      expiresAt: string;
    }>("/media/livekit/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }
}
