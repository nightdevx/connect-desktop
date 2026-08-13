import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { UserProfile } from "../shared/auth-contracts";

export interface DesktopSession {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

// Marks a file written through safeStorage. Plain JSON starts with "{", so the
// two formats are distinguishable and an existing plaintext session migrates on
// first read instead of logging the user out.
const ENCRYPTED_PREFIX = "ctenc1:";

export class SessionStore {
  private readonly filePath: string;

  private currentSession: DesktopSession | null = null;

  public constructor() {
    this.filePath = path.join(app.getPath("userData"), "session.json");
    this.loadFromDisk();
  }

  public get(): DesktopSession | null {
    return this.currentSession;
  }

  public set(session: DesktopSession): void {
    this.currentSession = session;
    this.persist();
  }

  public clear(): void {
    this.currentSession = null;
    // Delete rather than writing the literal string "null" over the tokens.
    try {
      fs.rmSync(this.filePath, { force: true });
    } catch {
      // Fall back to overwriting if the file cannot be removed.
      this.persist();
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, "utf-8");
      const json = this.decode(raw);
      if (json === null) {
        this.currentSession = null;
        return;
      }

      const parsed = JSON.parse(json) as Partial<DesktopSession>;
      if (
        parsed &&
        typeof parsed.accessToken === "string" &&
        typeof parsed.refreshToken === "string" &&
        parsed.user
      ) {
        this.currentSession = {
          user: parsed.user as UserProfile,
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
        };

        if (!raw.startsWith(ENCRYPTED_PREFIX)) {
          // Migrate a pre-existing plaintext session file in place.
          this.persist();
        }
      }
    } catch {
      this.currentSession = null;
    }
  }

  private decode(raw: string): string | null {
    if (!raw.startsWith(ENCRYPTED_PREFIX)) {
      return raw;
    }

    try {
      const payload = Buffer.from(raw.slice(ENCRYPTED_PREFIX.length), "base64");
      return safeStorage.decryptString(payload);
    } catch {
      // Wrong machine, wrong user, or a rotated OS key. Treat it as no session
      // rather than crashing at startup.
      return null;
    }
  }

  // Encrypted at rest through the OS keyring (DPAPI on Windows, Keychain on
  // macOS, libsecret on Linux).
  //
  // The tokens used to sit in readable JSON with mode 0o600, which Node maps to
  // nothing more than the read-only attribute on Windows — the only shipped
  // target. Any process running as the same user could read the refresh token
  // and, because refresh rotates, keep minting a fresh chain indefinitely.
  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

      const json = JSON.stringify(this.currentSession, null, 2);
      let contents = json;

      if (safeStorage.isEncryptionAvailable()) {
        contents =
          ENCRYPTED_PREFIX + safeStorage.encryptString(json).toString("base64");
      } else {
        // No keyring available (some Linux desktops). Keep working, but say so
        // — this is the one path where tokens still land in plaintext.
        console.warn(
          "[session] OS encryption unavailable; session tokens are stored unencrypted",
        );
      }

      fs.writeFileSync(this.filePath, contents, {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {
      // no-op
    }
  }
}
