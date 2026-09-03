import type { DesktopResult, LobbyStreamEvent } from "@shared/desktop-api-types";
import type { WatchSnapshot } from "@shared/watch";

const bridgeOutdated = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaüstü API güncel değil. Uygulamayı tamamen kapatıp yeniden başlatın.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

const outdated = () => Promise.resolve(bridgeOutdated as DesktopResult<WatchSnapshot>);

/**
 * The frames a watch session cares about.
 *
 * The socket's own status is one of them, and not incidentally: watch-state is
 * a delta stream with no replay, so "the connection came back" is the signal
 * that everything received before it may now be wrong.
 */
export type WatchStreamEvent = Extract<
  LobbyStreamEvent,
  { type: "watch-state" } | { type: "stream-status" }
>;

export const watchService = {
  onStreamEvent: (listener: (event: WatchStreamEvent) => void): (() => void) => {
    if (typeof window.desktopApi.onLobbyStreamEvent !== "function") {
      return () => undefined;
    }

    return window.desktopApi.onLobbyStreamEvent((event) => {
      if (event.type === "watch-state" || event.type === "stream-status") {
        listener(event);
      }
    });
  },
  getState: (lobbyId: string): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.getWatchState === "function"
      ? window.desktopApi.getWatchState({ lobbyId })
      : outdated(),
  start: (lobbyId: string, link: string): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.startWatch === "function"
      ? window.desktopApi.startWatch({ lobbyId, link })
      : outdated(),
  play: (lobbyId: string, position?: number): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.playWatch === "function"
      ? window.desktopApi.playWatch({ lobbyId, position })
      : outdated(),
  pause: (lobbyId: string, position?: number): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.pauseWatch === "function"
      ? window.desktopApi.pauseWatch({ lobbyId, position })
      : outdated(),
  seek: (lobbyId: string, position: number): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.seekWatch === "function"
      ? window.desktopApi.seekWatch({ lobbyId, position })
      : outdated(),
  describe: (
    lobbyId: string,
    videoId: string,
    title: string,
    durationSeconds: number,
  ): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.describeWatch === "function"
      ? window.desktopApi.describeWatch({ lobbyId, videoId, title, durationSeconds })
      : outdated(),
  stop: (lobbyId: string): Promise<DesktopResult<WatchSnapshot>> =>
    typeof window.desktopApi.stopWatch === "function"
      ? window.desktopApi.stopWatch({ lobbyId })
      : outdated(),
};
