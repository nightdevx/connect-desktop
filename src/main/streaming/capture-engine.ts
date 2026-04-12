import { desktopCapturer } from "electron";
import os from "node:os";
import type {
  CaptureEncoderPlan,
  CapturePlan,
  CaptureType,
  StartCaptureRequest,
  StartCaptureResult,
  StopCaptureResult,
} from "../../shared/streaming-contracts";

interface CaptureSession {
  sessionId: string;
  sourceId: string | null;
  sourceName: string;
  requestedType: CaptureType;
  effectiveType: CaptureType;
  gameDetected: boolean;
  plan: CapturePlan;
  createdAt: string;
}

const knownGameExecutables = [
  "steam.exe",
  "cs2.exe",
  "dota2.exe",
  "valorant.exe",
  "r5apex.exe",
  "fortniteclient-win64-shipping.exe",
  "leagueclient.exe",
  "rocketleague.exe",
  "gta5.exe",
  "eldenring.exe",
  "witcher3.exe",
  "overwatch.exe",
  "rainbowsix.exe",
  "pubg.exe",
  "cod.exe",
];

const knownGameNameHints = [
  "steam",
  "counter-strike",
  "cs2",
  "dota",
  "valorant",
  "apex",
  "fortnite",
  "league",
  "rocket league",
  "gta",
  "elden ring",
  "witcher",
  "overwatch",
  "rainbow six",
  "pubg",
  "call of duty",
];

// CaptureEngine plans desktop and camera capture sessions in the main process.
export class CaptureEngine {
  private readonly sessions = new Map<string, CaptureSession>();

  // startCapture resolves a capture source and returns a tuned capture plan.
  public async startCapture(
    request: StartCaptureRequest,
  ): Promise<StartCaptureResult> {
    if (request.type === "camera") {
      const session = this.createCameraSession();
      this.sessions.set(session.sessionId, session);
      return this.toResult(session);
    }

    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      fetchWindowIcons: true,
      thumbnailSize: { width: 0, height: 0 },
    });

    const matchedSource = this.findSource(
      sources,
      request.sourceId,
      request.type,
    );
    if (!matchedSource) {
      throw new Error("Capture source could not be found");
    }

    const isGame =
      request.type === "game" || this.isGameSource(matchedSource.name);
    const effectiveType: CaptureType = isGame ? "game" : request.type;
    const plan = this.createCapturePlan(effectiveType, matchedSource.name);

    const sessionId = `${effectiveType}:${Date.now()}`;
    const session: CaptureSession = {
      sessionId,
      sourceId: matchedSource.id,
      sourceName: matchedSource.name,
      requestedType: request.type,
      effectiveType,
      gameDetected: isGame,
      plan,
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    return this.toResult(session);
  }

  // stopCapture ends all active capture sessions.
  public stopCapture(): StopCaptureResult {
    if (this.sessions.size === 0) {
      return { stopped: false, stoppedSessions: [] };
    }

    const stoppedSessions = Array.from(this.sessions.keys());
    this.sessions.clear();
    return { stopped: true, stoppedSessions };
  }

  // hasActivePip returns whether camera and display capture are active at the same time.
  public hasActivePip(): boolean {
    let hasCamera = false;
    let hasDisplay = false;

    for (const session of this.sessions.values()) {
      if (session.effectiveType === "camera") {
        hasCamera = true;
      }
      if (
        session.effectiveType === "screen" ||
        session.effectiveType === "window" ||
        session.effectiveType === "game"
      ) {
        hasDisplay = true;
      }
    }

    return hasCamera && hasDisplay;
  }

  private createCameraSession(): CaptureSession {
    const encoder = this.resolveEncoderPlan(false);
    const plan: CapturePlan = {
      width: 1280,
      height: 720,
      frameRate: 30,
      pipCapable: true,
      gameModeActive: false,
      encoder,
    };

    return {
      sessionId: `camera:${Date.now()}`,
      sourceId: null,
      sourceName: "Camera",
      requestedType: "camera",
      effectiveType: "camera",
      gameDetected: false,
      plan,
      createdAt: new Date().toISOString(),
    };
  }

  private createCapturePlan(
    type: CaptureType,
    sourceName: string,
  ): CapturePlan {
    const gameMode = type === "game";
    const encoder = this.resolveEncoderPlan(gameMode);

    if (gameMode) {
      return {
        width: 1920,
        height: 1080,
        frameRate: this.resolveGameFrameRate(sourceName),
        pipCapable: true,
        gameModeActive: true,
        encoder,
      };
    }

    return {
      width: 1920,
      height: 1080,
      frameRate: 30,
      pipCapable: true,
      gameModeActive: false,
      encoder,
    };
  }

  private resolveGameFrameRate(sourceName: string): number {
    const lower = sourceName.toLowerCase();
    if (
      lower.includes("elden") ||
      lower.includes("witcher") ||
      lower.includes("gta")
    ) {
      return 24;
    }

    // Keep game capture at or below 30fps to avoid stealing CPU budget from gameplay.
    return 30;
  }

  private resolveEncoderPlan(gameMode: boolean): CaptureEncoderPlan {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model?.toLowerCase() ?? "";

    const hasQuickSync = cpuModel.includes("intel");
    const hasNVENC = process.platform === "win32";

    const hardwareEncoder = hasQuickSync
      ? "QuickSync"
      : hasNVENC
        ? "NVENC"
        : "Software";

    const preferHardwareEncoder = gameMode && hardwareEncoder !== "Software";

    const cpuEncoderThreads = gameMode
      ? 2
      : Math.max(2, Math.min(6, Math.floor(cpus.length / 2) || 2));

    return {
      preferHardwareEncoder,
      hardwareEncoder,
      cpuEncoderThreads,
    };
  }

  private findSource(
    sources: Electron.DesktopCapturerSource[],
    sourceId: string | undefined,
    captureType: CaptureType,
  ): Electron.DesktopCapturerSource | undefined {
    if (sourceId) {
      return sources.find((source) => source.id === sourceId);
    }

    if (captureType === "screen") {
      return sources.find((source) => source.id.startsWith("screen:"));
    }

    if (captureType === "window" || captureType === "game") {
      return sources.find((source) => source.id.startsWith("window:"));
    }

    return sources[0];
  }

  private isGameSource(sourceName: string): boolean {
    const normalized = sourceName.toLowerCase();

    for (const executable of knownGameExecutables) {
      const token = executable.replace(/\.exe$/i, "").replace(/[-_]/g, " ");
      if (token.length > 1 && normalized.includes(token)) {
        return true;
      }
    }

    return knownGameNameHints.some((hint) => normalized.includes(hint));
  }

  private toResult(session: CaptureSession): StartCaptureResult {
    return {
      sessionId: session.sessionId,
      sourceId: session.sourceId,
      sourceName: session.sourceName,
      requestedType: session.requestedType,
      effectiveType: session.effectiveType,
      gameDetected: session.gameDetected,
      plan: session.plan,
    };
  }
}
