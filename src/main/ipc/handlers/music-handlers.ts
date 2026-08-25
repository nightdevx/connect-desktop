import { ipcMain } from "electron";
import { backendClient, ok, fail, withAccessToken } from "../context";
import { musicCommandSchema, musicLobbySchema, musicUserSchema } from "../validators";

export function registerMusicHandlers(): void {
  ipcMain.handle("desktop:music-catalog", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.catalog(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:music-state", async (_event, payload: unknown) => {
    try {
      const { lobbyId } = musicLobbySchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.state(accessToken, lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:music-command", async (_event, payload: unknown) => {
    try {
      const { lobbyId, command } = musicCommandSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.command(accessToken, lobbyId, command);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-music-djs", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.listDJs(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-grant-music-dj", async (_event, payload: unknown) => {
    try {
      const { userId } = musicUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.grantDJ(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-revoke-music-dj", async (_event, payload: unknown) => {
    try {
      const { userId } = musicUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.music.revokeDJ(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });
}
