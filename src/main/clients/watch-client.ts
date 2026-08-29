import type { BaseClient } from "./base-client";
import type { WatchSnapshot } from "../../shared/watch";

export class WatchClient {
  public constructor(private readonly baseClient: BaseClient) {}

  private lobbyPath(lobbyId: string, action: string): string {
    return `/watch/lobbies/${encodeURIComponent(lobbyId)}/${action}`;
  }

  public async state(accessToken: string, lobbyId: string): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "state"), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async start(
    accessToken: string,
    lobbyId: string,
    link: string,
  ): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "start"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ link }),
    });
  }

  public async play(
    accessToken: string,
    lobbyId: string,
    position?: number,
  ): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "play"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      // null rather than an omitted key: the server distinguishes "resume where
      // you think we are" from "resume at exactly 0", and an absent field is the
      // former.
      body: JSON.stringify({ position: position ?? null }),
    });
  }

  public async pause(
    accessToken: string,
    lobbyId: string,
    position?: number,
  ): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "pause"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ position: position ?? null }),
    });
  }

  public async seek(
    accessToken: string,
    lobbyId: string,
    position: number,
  ): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "seek"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ position }),
    });
  }

  public async describe(
    accessToken: string,
    lobbyId: string,
    videoId: string,
    title: string,
    durationSeconds: number,
  ): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "describe"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ videoId, title, durationSeconds }),
    });
  }

  public async stop(accessToken: string, lobbyId: string): Promise<WatchSnapshot> {
    return this.baseClient.request<WatchSnapshot>(this.lobbyPath(lobbyId, "stop"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
