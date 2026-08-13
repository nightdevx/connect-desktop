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

// A Sentry DSN is a public, write-only key — safe to ship in the package.
//
// Without it in .env.runtime, process.env.SENTRY_DSN is undefined in every
// installed build, so the main process never called Sentry.init and the
// renderer's Sentry.init({}) tunnelled to an uninitialised main process.
// Crash reporting was 100% dead in production while ~16 MB of @sentry/* rode
// along in the asar.
const pickSentryDsn = () => {
  const fromProcess = process.env.SENTRY_DSN?.trim();
  if (fromProcess) {
    return { value: fromProcess, source: "process.env" };
  }

  if (existsSync(projectEnvPath)) {
    const parsedEnv = parse(readFileSync(projectEnvPath, "utf8"));
    const fromFile = parsedEnv.SENTRY_DSN?.trim();
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

const lines = [
  "# Auto-generated at build time. Do not edit manually.",
  `CT_BACKEND_URL=${normalizedUrl}`,
];

// Warn rather than fail: a build without crash reporting is still a valid
// build, but the team should know it produced one.
const sentryDsn = pickSentryDsn();
if (sentryDsn) {
  lines.push(`SENTRY_DSN=${sentryDsn.value}`);
} else {
  console.warn(
    "[generate-runtime-env] SENTRY_DSN not set: this build will report no crashes.",
  );
}

writeFileSync(runtimeEnvPath, lines.join("\n") + "\n", "utf8");
console.log(
  `[generate-runtime-env] wrote ${runtimeEnvPath} (backend=${picked.source}${
    sentryDsn ? `, sentry=${sentryDsn.source}` : ", sentry=absent"
  })`,
);
