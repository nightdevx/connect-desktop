import { ipcMain } from "electron";
import { watchPlayerURL } from "../../watch-player-host";
import { backendClient, ok, fail, withAccessToken } from "../context";
import {
  watchDescribeSchema,
  watchLobbySchema,
  watchPositionSchema,
  watchSeekSchema,
  watchStartSchema,
} from "../validators";

export function registerWatchHandlers(): void {
  // The renderer asks for this once and embeds it. See watch-player-host for
  // why the player cannot simply live in the renderer document.
  ipcMain.handle("desktop:watch-player-url", async () => {
    try {
      return ok({ url: await watchPlayerURL() });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-state", async (_event, payload: unknown) => {
    try {
      const { lobbyId } = watchLobbySchema.parse(payload);
      return ok(await withAccessToken((token) => backendClient.watch.state(token, lobbyId)));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-start", async (_event, payload: unknown) => {
    try {
      const { lobbyId, link } = watchStartSchema.parse(payload);
      return ok(
        await withAccessToken((token) => backendClient.watch.start(token, lobbyId, link)),
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-play", async (_event, payload: unknown) => {
    try {
      const { lobbyId, position } = watchPositionSchema.parse(payload);
      return ok(
        await withAccessToken((token) => backendClient.watch.play(token, lobbyId, position)),
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-pause", async (_event, payload: unknown) => {
    try {
      const { lobbyId, position } = watchPositionSchema.parse(payload);
      return ok(
        await withAccessToken((token) => backendClient.watch.pause(token, lobbyId, position)),
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-seek", async (_event, payload: unknown) => {
    try {
      const { lobbyId, position } = watchSeekSchema.parse(payload);
      return ok(
        await withAccessToken((token) => backendClient.watch.seek(token, lobbyId, position)),
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-describe", async (_event, payload: unknown) => {
    try {
      const { lobbyId, videoId, title, durationSeconds } = watchDescribeSchema.parse(payload);
      return ok(
        await withAccessToken((token) =>
          backendClient.watch.describe(token, lobbyId, videoId, title, durationSeconds),
        ),
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:watch-stop", async (_event, payload: unknown) => {
    try {
      const { lobbyId } = watchLobbySchema.parse(payload);
      return ok(await withAccessToken((token) => backendClient.watch.stop(token, lobbyId)));
    } catch (error) {
      return fail(error);
    }
  });
}
