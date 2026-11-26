import { app } from "electron";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

// Chat attachments are immutable by id, so once downloaded they are kept on
// disk instead of being fetched again on every view. Each file is the mime type,
// a newline, then the bytes. Any fs error is a miss: the cache must never break
// a download.

export interface AttachmentCache {
  get(id: string): Promise<{ mimeType: string; bytes: Buffer } | null>;
  put(id: string, mimeType: string, bytes: Buffer): Promise<void>;
  clear(): Promise<void>;
}

export const createAttachmentCache = ({ dir, maxBytes }: { dir: string; maxBytes: number }): AttachmentCache => {
  // A hash, never the id itself: an id cannot carry a path out of `dir`.
  const fileFor = (id: string): string => path.join(dir, createHash("sha256").update(id).digest("hex"));

  // Least recently used first out. A read bumps the file's times, so what is
  // on screen survives.
  const trim = async (): Promise<void> => {
    const entries = await Promise.all(
      (await readdir(dir)).map(async (name) => {
        const info = await stat(path.join(dir, name));
        return { name, size: info.size, used: info.mtimeMs };
      }),
    );
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.used - b.used)) {
      if (total <= maxBytes) break;
      await rm(path.join(dir, entry.name), { force: true });
      total -= entry.size;
    }
  };

  return {
    async get(id) {
      try {
        const file = fileFor(id);
        const raw = await readFile(file);
        const split = raw.indexOf(10);
        if (split < 0) return null;
        const now = new Date();
        await utimes(file, now, now).catch(() => undefined);
        return { mimeType: raw.subarray(0, split).toString("utf8"), bytes: raw.subarray(split + 1) };
      } catch {
        return null;
      }
    },

    async put(id, mimeType, bytes) {
      try {
        await mkdir(dir, { recursive: true });
        const file = fileFor(id);
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, Buffer.concat([Buffer.from(`${mimeType}\n`, "utf8"), bytes]));
        await rename(tmp, file);
        await trim();
      } catch {
        // Not cached; the next view downloads again.
      }
    },

    async clear() {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
};

let appCache: AttachmentCache | null = null;

// Created on first use so importing this module never touches the disk.
export const getAttachmentCache = (): AttachmentCache =>
  (appCache ??= createAttachmentCache({
    dir: path.join(app.getPath("userData"), "attachment-cache"),
    maxBytes: 300 * 1024 * 1024,
  }));

// Signing out must not leave one account's photos for the next on a shared PC.
export const clearAttachmentCache = (): Promise<void> => getAttachmentCache().clear();
