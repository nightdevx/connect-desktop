import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { isAutoLoadableImageUrl } from "../../../shared/gif-hosts";
import { DesktopApiError } from "../../backend-client";

const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;

// A sensible default for the save dialog, from the URL's own last path segment.
// Never used as a path: showSaveDialog is where the user picks the real one.
const remoteImageFileName = (url: string): string => {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const safe = last.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
    return /.(?:gif|png|jpe?g|webp)$/i.test(safe) ? safe : "gorsel.gif";
  } catch {
    return "gorsel.gif";
  }
};
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
  saveImageUrlSchema,
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

  // Save an image that lives at a remote URL — a GIF someone posted — rather
  // than one uploaded as an attachment.
  //
  // The URL comes out of a message body, i.e. it is attacker-controlled text,
  // so it is re-validated here against the same allowlist that decides whether
  // a body renders as an <img> at all. Without that this handler is an
  // arbitrary-URL fetcher running in the main process with no CSP over it:
  // anyone could post a link and have every reader's machine GET it, and a
  // file:// or http://localhost URL would reach things the renderer cannot.
  ipcMain.handle("desktop:chat-image-save", async (event, payload: unknown) => {
    try {
      const parsed = saveImageUrlSchema.parse(payload);
      if (!isAutoLoadableImageUrl(parsed.url)) {
        return fail(
          new DesktopApiError(
            "IMAGE_HOST_NOT_ALLOWED",
            400,
            "Bu adresten görsel indirilemez.",
          ),
        );
      }

      // Bounded: a hung CDN must not leave the handler awaiting forever, and a
      // "gif" that is actually 500 MB must not be buffered into memory.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let bytes: Buffer;
      try {
        const response = await fetch(parsed.url, { signal: controller.signal });
        if (!response.ok) {
          return fail(
            new DesktopApiError(
              "IMAGE_DOWNLOAD_FAILED",
              response.status,
              "Görsel indirilemedi.",
            ),
          );
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
          return fail(
            new DesktopApiError(
              "IMAGE_TOO_LARGE",
              413,
              "Görsel çok büyük.",
            ),
          );
        }
        bytes = buffer;
      } finally {
        clearTimeout(timeout);
      }

      const dialogOptions = {
        title: "Görseli kaydet",
        defaultPath: remoteImageFileName(parsed.url),
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

  // No payload: every peer this user has history with, which is what seeds the
  // sidebar's open-conversation list on a fresh install.
  ipcMain.handle("desktop:chat-conversations", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.listConversations(accessToken);
      });
      return ok(result);
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
