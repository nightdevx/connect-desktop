import { app } from "electron";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

// In a packaged build only the file we shipped is trusted.
//
// The candidate list used to start with `process.cwd()/.env`, which for an
// installed app is whatever directory it was launched from — a shortcut's
// "Start in", or the install directory itself. A one-line .env dropped beside
// the exe therefore beat the packaged resources/.env.runtime and repointed
// CT_BACKEND_URL, sending every login (plaintext password included), every
// token and every websocket to another host. The same precedence also meant a
// leftover development .env silently redirected an installed app.
const envCandidates = (): string[] => {
  if (app.isPackaged) {
    return [resolve(process.resourcesPath, ".env.runtime")];
  }

  return [
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../../.env.runtime"),
  ];
};

const loadEnvFile = (): string | null => {
  for (const candidatePath of envCandidates()) {
    if (existsSync(candidatePath)) {
      loadDotenv({ path: candidatePath, override: false });
      return candidatePath;
    }
  }

  return null;
};

const envFilePath = loadEnvFile();

// Only http/https, and only a parseable URL. A malformed or exotic-scheme value
// would otherwise be handed straight to fetch and to the websocket managers.
const sanitizeBackendUrl = (raw: string): string | null => {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
};

const resolveBackendConfig = (): { url: string; source: string } => {
  const ctBackend = sanitizeBackendUrl(process.env.CT_BACKEND_URL ?? "");
  if (ctBackend) {
    return { url: ctBackend, source: "CT_BACKEND_URL" };
  }

  const legacyBackend = sanitizeBackendUrl(process.env.BACKEND_URL ?? "");
  if (legacyBackend) {
    return { url: legacyBackend, source: "BACKEND_URL" };
  }

  if (app.isPackaged) {
    // Falling back to localhost in a shipped build hides a broken build far
    // more often than it helps: the app would start and then fail every
    // request with a confusing connection error.
    throw new Error(
      "CT_BACKEND_URL is missing from the packaged .env.runtime. " +
        "The installer was built without a backend URL.",
    );
  }

  return { url: "http://127.0.0.1:4001", source: "default" };
};

export const backendConfig = {
  ...resolveBackendConfig(),
  envFilePath,
};

export const backendBaseUrl = backendConfig.url;

// The KLIPY key for the composer's GIF button. Read here, in main, and never
// exported past this process: KLIPY carries the key as a URL PATH SEGMENT, so
// any renderer-side fetch would hand it to @sentry/electron's Breadcrumbs
// integration, which records fetch URLs verbatim and attaches them to
// unrelated error reports.
//
// Optional by design. No key means klipyApiKey is null, the GIF button is
// never rendered, and the composer looks exactly as it did before GIFs
// existed -- no half-working panel, no error toast.
//
// The charset is enforced rather than trusted because the key is interpolated
// into a URL path: a value containing "/" or "?" from a stray .env would
// otherwise rewrite the endpoint being called.
const sanitizeKlipyApiKey = (raw: string): string | null => {
  const trimmed = raw.trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
};

export const klipyApiKey = sanitizeKlipyApiKey(process.env.CT_KLIPY_API_KEY ?? "");

export const isKlipyConfigured = klipyApiKey !== null;
