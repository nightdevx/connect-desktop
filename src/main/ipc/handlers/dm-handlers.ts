import { ipcMain } from "electron";
import {
  backendClient,
  directMessagesStreamManager,
  ok,
  fail,
  withAccessToken,
} from "../context";
import {
  directMessagesListSchema,
  sendDirectMessageSchema,
  directMessagesStreamStartSchema,
  directMessagesStreamStopSchema,
} from "../validators";

export function registerDMHandlers(): void {
  ipcMain.handle("desktop:direct-messages-list", async (_event, payload: unknown) => {
    try {
      const parsed = directMessagesListSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.listDirectMessages(
          accessToken,
          parsed.peerUserId,
          parsed.limit,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-messages-send", async (_event, payload: unknown) => {
    try {
      const parsed = sendDirectMessageSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.sendDirectMessage(
          accessToken,
          parsed.peerUserId,
          parsed.body,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-messages-start", async (event, payload: unknown) => {
    try {
      const parsed = directMessagesStreamStartSchema.parse(payload);
      await withAccessToken(async (accessToken) => {
        return directMessagesStreamManager.start(
          event.sender,
          parsed.peerUserId,
          accessToken,
        );
      });
      return ok({ started: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-messages-stop", async (event, payload: unknown) => {
    try {
      const parsed = directMessagesStreamStopSchema.parse(payload);
      if (parsed.peerUserId) {
        directMessagesStreamManager.stop(event.sender.id, parsed.peerUserId);
      } else {
        directMessagesStreamManager.stop(event.sender.id);
      }
      return ok({ stopped: true });
    } catch (error) {
      return fail(error);
    }
  });
}
