const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parse } = require("dotenv");

const projectRoot = process.cwd();
const runtimeEnvPath = resolve(projectRoot, ".env.runtime");
const projectEnvPath = resolve(projectRoot, ".env");

const normalizeBackendUrl = (value) => value.trim().replace(/\/+$/, "");

const isSupportedBackendUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const pickBackendUrl = () => {
  const envDirect =
    process.env.CT_BACKEND_URL?.trim() || process.env.BACKEND_URL?.trim();
  if (envDirect) {
    return { value: envDirect, source: "process.env" };
  }

  if (existsSync(projectEnvPath)) {
    const parsedEnv = parse(readFileSync(projectEnvPath, "utf8"));
    const fromFile =
      parsedEnv.CT_BACKEND_URL?.trim() || parsedEnv.BACKEND_URL?.trim();
    if (fromFile) {
      return { value: fromFile, source: ".env" };
    }
  }

  return null;
};

const picked = pickBackendUrl();
if (!picked) {
  throw new Error(
    "No backend URL found. Set CT_BACKEND_URL (preferred) or BACKEND_URL in process env or .env before building.",
  );
}

const normalizedUrl = normalizeBackendUrl(picked.value);
if (!isSupportedBackendUrl(normalizedUrl)) {
  throw new Error(
    `Invalid backend URL: ${picked.value}. Only http/https URLs are supported.`,
  );
}

const runtimeEnvContent = [
  "# Auto-generated at build time. Do not edit manually.",
  `CT_BACKEND_URL=${normalizedUrl}`,
  "",
].join("\n");

writeFileSync(runtimeEnvPath, runtimeEnvContent, "utf8");
console.log(
  `[generate-runtime-env] wrote ${runtimeEnvPath} (source=${picked.source})`,
);
