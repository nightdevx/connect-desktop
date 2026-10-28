#!/usr/bin/env node
// Self-check: every invoke channel goes through handle() (src/main/ipc/handle.ts),
// which refuses calls from anything but the app's own page, and every channel
// is listed in IPC_INVOKE_CHANNELS.
//
// That list is what clearIpcInvokeHandlers() walks before registerIpcHandlers()
// runs again. A channel missing from it is not registered-twice-safe: the
// second registration throws "Attempted to register a second handler", partway
// through, leaving every handler after it in the file unregistered — so a
// reload lands in an app where a scattered subset of IPC calls reject forever.
// It is invisible until someone reloads, which is why it drifted to 37 missing
// channels before anyone noticed.
//
//   node scripts/check-ipc-channels.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const handlersDir = path.join(projectRoot, "src/main/ipc/handlers");
const indexFile = path.join(projectRoot, "src/main/ipc/index.ts");

const handlerChannels = new Set();
for (const name of fs.readdirSync(handlersDir)) {
  if (!name.endsWith(".ts")) {
    continue;
  }

  const source = fs.readFileSync(path.join(handlersDir, name), "utf8");
  for (const match of source.matchAll(/\bhandle\(\s*["']([^"']+)["']/g)) {
    handlerChannels.add(match[1]);
  }
}

assert.ok(
  handlerChannels.size > 50,
  `expected to find the handler channels, found ${handlerChannels.size}`,
);

const indexSource = fs.readFileSync(indexFile, "utf8");
const listMatch = indexSource.match(
  /const IPC_INVOKE_CHANNELS = \[([\s\S]*?)\] as const;/,
);
assert.ok(listMatch, "IPC_INVOKE_CHANNELS not found in src/main/ipc/index.ts");

const listedChannels = new Set(
  [...listMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
);

const missing = [...handlerChannels].filter(
  (channel) => !listedChannels.has(channel),
);
assert.deepEqual(
  missing,
  [],
  `these channels are handled but not listed in IPC_INVOKE_CHANNELS:\n  ${missing.join("\n  ")}`,
);

// The other direction is a smaller problem — removeHandler on an unknown
// channel is a no-op — but it means a channel was renamed or deleted and the
// list still claims it.
const stale = [...listedChannels].filter(
  (channel) => !handlerChannels.has(channel) && !channel.startsWith("app:"),
);
assert.deepEqual(
  stale,
  [],
  `these channels are listed but no longer handled:\n  ${stale.join("\n  ")}`,
);

// A channel registered straight on ipcMain skips the sender check.
const mainDir = path.join(projectRoot, "src/main");
const bypasses = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".ts") && full !== path.join(mainDir, "ipc", "handle.ts")) {
      if (/ipcMain\.(handle|handleOnce)\(/.test(fs.readFileSync(full, "utf8"))) {
        bypasses.push(path.relative(projectRoot, full));
      }
    }
  }
};
walk(mainDir);
assert.deepEqual(
  bypasses,
  [],
  `these files call ipcMain.handle directly instead of handle() from src/main/ipc/handle.ts:\n  ${bypasses.join("\n  ")}`,
);

console.log(`ipc-channels self-check passed (${handlerChannels.size} channels)`);
