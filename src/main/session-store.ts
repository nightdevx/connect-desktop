import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { UserProfile } from "../shared/auth-contracts";

export interface DesktopSession {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

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
    this.persist();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DesktopSession>;
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
      }
    } catch {
      this.currentSession = null;
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.currentSession, null, 2),
        {
          encoding: "utf-8",
          mode: 0o600,
        },
      );
    } catch {
      // no-op
    }
  }
}
