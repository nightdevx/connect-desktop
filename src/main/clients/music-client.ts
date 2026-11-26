import { guildQuery, type BaseClient } from "./base-client";
import type { MusicCatalog, MusicDJ, MusicState } from "../../shared/music";

const RESOLVE_TIMEOUT_MS = 30_000;

export class MusicClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async catalog(accessToken: string): Promise<MusicCatalog> {
    return this.baseClient.request<MusicCatalog>(`/music/commands`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async state(
    accessToken: string,
    lobbyId: string,
  ): Promise<{ state: MusicState; isDj: boolean }> {
    return this.baseClient.request<{ state: MusicState; isDj: boolean }>(
      `/music/lobbies/${encodeURIComponent(lobbyId)}/state`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async command(
    accessToken: string,
    lobbyId: string,
    command: string,
  ): Promise<{ state: MusicState; reply: string; isDj: boolean }> {
    return this.baseClient.request<{ state: MusicState; reply: string; isDj: boolean }>(
      `/music/lobbies/${encodeURIComponent(lobbyId)}/command`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ command }),
      },
      RESOLVE_TIMEOUT_MS,
    );
  }

  public async listDJs(
    accessToken: string,
    guildId?: string,
  ): Promise<{ djs: MusicDJ[]; spotifyEnabled: boolean }> {
    return this.baseClient.request<{ djs: MusicDJ[]; spotifyEnabled: boolean }>(
      `/admin/music/djs${guildQuery(guildId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async grantDJ(accessToken: string, userId: string, guildId?: string): Promise<{ dj: MusicDJ }> {
    return this.baseClient.request<{ dj: MusicDJ }>(
      `/admin/music/djs/${encodeURIComponent(userId)}${guildQuery(guildId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async revokeDJ(accessToken: string, userId: string, guildId?: string): Promise<{ revoked: boolean }> {
    return this.baseClient.request<{ revoked: boolean }>(
      `/admin/music/djs/${encodeURIComponent(userId)}${guildQuery(guildId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }
}
