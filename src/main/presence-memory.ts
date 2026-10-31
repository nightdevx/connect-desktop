import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { SelectablePresenceStatus } from "../shared/auth-contracts";
import { writeFileAtomic } from "./utils/atomic-write";

/**
 * The status each account on this machine last asked the server to show.
 *
 * The server keeps presence in memory only, drops it 12 s after the last socket
 * closes, and announces whatever it holds the moment a socket connects: plain
 * "online" when it holds nothing. So a restart, a long outage or a sleep
 * brought the user back as "online" whatever they had picked, and invisible
 * was not invisible. Sending the status again after the connect would still
 * have shown every friend a moment of "online" first, so the stream host puts
 * it back before it opens a socket (context.ts, restorePresence).
 *
 * What was last published, auto-idle included, not what was picked: the
 * renderer keeps the pick (use-presence-status), and this is only what the
 * server should be showing.
 */
const STATUSES: ReadonlySet<string> = new Set(["online", "idle", "dnd", "offline"]);

let byUser: Record<string, SelectablePresenceStatus> | null = null;

const filePath = (): string => path.join(app.getPath("userData"), "presence.json");

const load = (): Record<string, SelectablePresenceStatus> => {
  if (byUser) {
    return byUser;
  }
  byUser = {};
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath(), "utf-8"));
    for (const [userId, status] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof status === "string" && STATUSES.has(status)) {
        byUser[userId] = status as SelectablePresenceStatus;
      }
    }
  } catch {
    // No file yet, or a damaged one: nothing remembered.
  }
  return byUser;
};

export const rememberPresence = (userId: string, status: SelectablePresenceStatus): void => {
  const all = load();
  if (all[userId] === status) {
    return;
  }
  all[userId] = status;
  try {
    writeFileAtomic(filePath(), JSON.stringify(all));
  } catch {
    // Kept for this run; the next restart starts from "online".
  }
};

export const rememberedPresence = (userId: string): SelectablePresenceStatus | null =>
  load()[userId] ?? null;
