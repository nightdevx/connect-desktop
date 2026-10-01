#!/usr/bin/env node
// Self-check for how the desktop asks to leave a room
// (src/main/clients/lobby-client.ts, leaveLobby).
//
// The server's body decoder refuses unknown fields. So anything the client adds
// to a leave -- why it is leaving, that it means every room -- has to ride the
// query string: a server from before those fields existed ignores a query it
// does not read, but answers 400 to a body it does not know, and every leave,
// including the one at shutdown, would be refused.
//
//   BODY      only { lobbyId } or {} -- never the reason, never the flag.
//   ALL       no lobbyId means every room, and says so with all=1.
//   REASON    travels as ?reason=, and only when there is one.
//
//   node scripts/check-lobby-leave.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-lobby-leave-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/main/clients/lobby-client.ts"),
        formats: ["es"],
        fileName: () => "lobby-client.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const { LobbyClient } = await import(
    pathToFileURL(path.join(outDir, "lobby-client.mjs")).href
  );

  const sent = [];
  const client = new LobbyClient({
    request: async (requestPath, init) => {
      sent.push({ path: requestPath, init });
      return { accepted: true, lobbyId: "x" };
    },
  });
  const leave = async (...args) => {
    sent.length = 0;
    await client.leaveLobby("token", ...args);
    assert.equal(sent.length, 1, "one leave is one request");
    const [{ path: requestPath, init }] = sent;
    const url = new URL(requestPath, "http://server");
    return { url, body: JSON.parse(init.body), init };
  };

  // A named room, with a reason.
  {
    const { url, body, init } = await leave("oyun-odasi", "switch");
    assert.equal(init.method, "POST");
    assert.equal(url.pathname, "/lobby/leave");
    assert.deepEqual(body, { lobbyId: "oyun-odasi" }, "the body carries the room and nothing else");
    assert.equal(url.searchParams.get("reason"), "switch");
    assert.equal(url.searchParams.has("all"), false, "naming a room is not leaving everything");
  }

  // Shutdown: every room, said explicitly.
  {
    const { url, body } = await leave(undefined, "quit");
    assert.deepEqual(body, {}, "leaving everything sends an empty body, as older clients did");
    assert.equal(url.searchParams.get("all"), "1", "leaving everything must say so");
    assert.equal(url.searchParams.get("reason"), "quit");
  }

  // No reason given: no reason sent.
  {
    const { url, body } = await leave("oyun-odasi");
    assert.deepEqual(body, { lobbyId: "oyun-odasi" });
    assert.equal(url.searchParams.has("reason"), false);
    assert.equal(url.search, "", "nothing to add means no query string");
  }

  // Whatever is added later, it must never reach the body.
  for (const args of [["oyun-odasi", "user"], [undefined, "quit"], ["oyun-odasi", "kicked"]]) {
    const { body } = await leave(...args);
    for (const key of Object.keys(body)) {
      assert.equal(key, "lobbyId", `the leave body grew a "${key}" field; an older server refuses it`);
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("lobby-leave self-check passed (body stays { lobbyId }, metadata in the query)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
