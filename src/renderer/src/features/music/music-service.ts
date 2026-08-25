import type { DesktopResult, LobbyStreamEvent } from "@shared/desktop-api-types";
import type { MusicCatalog, MusicDJ, MusicState } from "@shared/music";

const bridgeOutdated = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

export const musicService = {
  onStateEvent: (
    listener: (event: Extract<LobbyStreamEvent, { type: "music-state" }>) => void,
  ): (() => void) => {
    if (typeof window.desktopApi.onLobbyStreamEvent !== "function") {
      return () => undefined;
    }

    return window.desktopApi.onLobbyStreamEvent((event) => {
      if (event.type === "music-state") {
        listener(event);
      }
    });
  },
  getCatalog: (): Promise<DesktopResult<MusicCatalog>> => {
    if (typeof window.desktopApi.getMusicCatalog !== "function") {
      return Promise.resolve(bridgeOutdated as DesktopResult<MusicCatalog>);
    }
    return window.desktopApi.getMusicCatalog();
  },
  getState: (
    lobbyId: string,
  ): Promise<DesktopResult<{ state: MusicState; isDj: boolean }>> => {
    if (typeof window.desktopApi.getMusicState !== "function") {
      return Promise.resolve(
        bridgeOutdated as DesktopResult<{ state: MusicState; isDj: boolean }>,
      );
    }
    return window.desktopApi.getMusicState({ lobbyId });
  },
  sendCommand: (
    lobbyId: string,
    command: string,
  ): Promise<DesktopResult<{ state: MusicState; reply: string; isDj: boolean }>> => {
    if (typeof window.desktopApi.sendMusicCommand !== "function") {
      return Promise.resolve(
        bridgeOutdated as DesktopResult<{
          state: MusicState;
          reply: string;
          isDj: boolean;
        }>,
      );
    }
    return window.desktopApi.sendMusicCommand({ lobbyId, command });
  },
  adminListDJs: (): Promise<
    DesktopResult<{ djs: MusicDJ[]; spotifyEnabled: boolean }>
  > => {
    if (typeof window.desktopApi.adminListMusicDJs !== "function") {
      return Promise.resolve(
        bridgeOutdated as DesktopResult<{ djs: MusicDJ[]; spotifyEnabled: boolean }>,
      );
    }
    return window.desktopApi.adminListMusicDJs();
  },
  adminGrantDJ: (userId: string): Promise<DesktopResult<{ dj: MusicDJ }>> => {
    if (typeof window.desktopApi.adminGrantMusicDJ !== "function") {
      return Promise.resolve(bridgeOutdated as DesktopResult<{ dj: MusicDJ }>);
    }
    return window.desktopApi.adminGrantMusicDJ(userId);
  },
  adminRevokeDJ: (userId: string): Promise<DesktopResult<{ revoked: boolean }>> => {
    if (typeof window.desktopApi.adminRevokeMusicDJ !== "function") {
      return Promise.resolve(bridgeOutdated as DesktopResult<{ revoked: boolean }>);
    }
    return window.desktopApi.adminRevokeMusicDJ(userId);
  },
};

export default musicService;
