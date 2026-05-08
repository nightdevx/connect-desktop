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
    return this.baseClient.request<{
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
}
