import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

const loadEnvFile = (): string | null => {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../.env"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
      return path;
    }
  }

  return null;
};

const envFilePath = loadEnvFile();

const resolveBackendConfig = (): { url: string; source: string } => {
  const ctBackend = process.env.CT_BACKEND_URL?.trim();
  if (ctBackend) {
    return { url: ctBackend.replace(/\/+$/, ""), source: "CT_BACKEND_URL" };
  }

  const legacyBackend = process.env.BACKEND_URL?.trim();
  if (legacyBackend) {
    return { url: legacyBackend.replace(/\/+$/, ""), source: "BACKEND_URL" };
  }

  return { url: "http://127.0.0.1:4001", source: "default" };
};

export const backendConfig = {
  ...resolveBackendConfig(),
  envFilePath,
};

export const backendBaseUrl = backendConfig.url;
