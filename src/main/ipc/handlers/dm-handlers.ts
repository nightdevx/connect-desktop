import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import {
  backendClient,
  directMessagesStreamManager,
  ok,
  fail,
  withAccessToken,
} from "../context";
import {
  attachmentFetchSchema,
  directMessagesListSchema,
  directSearchSchema,
  directTypingSchema,
  markDirectReadSchema,
  messageEditSchema,
  messageReactionSchema,
  saveAttachmentSchema,
  sendDirectMessageSchema,
  unreadCountsSchema,
} from "../validators";

export function registerDMHandlers(): void {
  ipcMain.handle("desktop:chat-message-edit", async (_event, payload: unknown) => {
    try {
      const parsed = messageEditSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.editMessage(
          accessToken,
          parsed.messageId,
          parsed.body,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:chat-message-reaction", async (_event, payload: unknown) => {
    try {
      const parsed = messageReactionSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.setReaction(
          accessToken,
          parsed.messageId,
          parsed.emoji,
          parsed.add,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:chat-direct-search", async (_event, payload: unknown) => {
    try {
      const parsed = directSearchSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.searchDirectMessages(
          accessToken,
          parsed.peerUserId,
          parsed.query,
          parsed.limit,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:chat-attachment-get", async (_event, payload: unknown) => {
    try {
      const parsed = attachmentFetchSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.fetchAttachment(accessToken, parsed.attachmentId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  // Save-as runs in the main process: the artifact sandbox and the renderer's
  // CSP both make a download link inert, and only main can open a file dialog.
  ipcMain.handle("desktop:chat-attachment-save", async (event, payload: unknown) => {
    try {
      const parsed = saveAttachmentSchema.parse(payload);
      const { bytes } = await withAccessToken((accessToken) => {
        return backendClient.chat.downloadAttachment(
          accessToken,
          parsed.attachmentId,
        );
      });

      const dialogOptions = {
        title: "Dosyayı kaydet",
        defaultPath: parsed.fileName,
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const target = window
        ? await dialog.showSaveDialog(window, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);

      if (target.canceled || !target.filePath) {
        return ok({ saved: false });
      }

      await writeFile(target.filePath, bytes);
      return ok({ saved: true, path: target.filePath });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-messages-list", async (_event, payload: unknown) => {
    try {
      const parsed = directMessagesListSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.listDirectMessages(
          accessToken,
          parsed.peerUserId,
          parsed.limit,
          parsed.before,
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
        return backendClient.chat.sendDirectMessage(accessToken, parsed.peerUserId, {
          body: parsed.body,
          replyToId: parsed.replyToId,
          attachment: parsed.attachment,
        });
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-read", async (_event, payload: unknown) => {
    try {
      const parsed = markDirectReadSchema.parse(payload);
      await withAccessToken((accessToken) => {
        return backendClient.chat.markDirectRead(accessToken, parsed.peerUserId);
      });
      return ok({ marked: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-unread", async (_event, payload: unknown) => {
    try {
      const parsed = unreadCountsSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.getUnreadCounts(accessToken, parsed.peerUserIds);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-typing", async (_event, payload: unknown) => {
    try {
      const parsed = directTypingSchema.parse(payload);
      await withAccessToken((accessToken) => {
        return backendClient.chat.sendDirectTyping(accessToken, parsed.peerUserId);
      });
      return ok({ sent: true });
    } catch (error) {
      return fail(error);
    }
  });

  // No payload: one socket per window covers every conversation.
  ipcMain.handle("desktop:direct-messages-start", async (event) => {
    try {
      await withAccessToken(async (accessToken) => {
        return directMessagesStreamManager.start(event.sender, accessToken);
      });
      return ok({ started: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:direct-messages-stop", async (event) => {
    try {
      directMessagesStreamManager.stop(event.sender.id);
      return ok({ stopped: true });
    } catch (error) {
      return fail(error);
    }
  });
}
