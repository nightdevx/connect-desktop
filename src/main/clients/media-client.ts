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

  public async initiateCall(
    accessToken: string,
    targetUserId: string,
  ): Promise<{ callId: string }> {
    return this.baseClient.request<{ callId: string }>("/media/livekit/call/initiate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetUserId }),
    });
  }

  public async acceptCall(
    accessToken: string,
    callId: string,
    callerId: string,
  ): Promise<{ ok: boolean }> {
    return this.baseClient.request<{ ok: boolean }>("/media/livekit/call/accept", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ callId, callerId }),
    });
  }

  public async rejectCall(
    accessToken: string,
    callId: string,
    callerId: string,
  ): Promise<{ ok: boolean }> {
    return this.baseClient.request<{ ok: boolean }>("/media/livekit/call/reject", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ callId, callerId }),
    });
  }

  public async cancelCall(
    accessToken: string,
    callId: string,
    targetUserId: string,
  ): Promise<{ ok: boolean }> {
    return this.baseClient.request<{ ok: boolean }>("/media/livekit/call/cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ callId, targetUserId }),
    });
  }
}
