#!/usr/bin/env node
// Self-check for src/renderer/src/features/workspace/hooks/chat/pending-sends.ts:
// messages on screen before the server has them.
//
// What it holds:
//   - a send is shown at once as "sending" and is gone from the pending list
//     once the server has it;
//   - the server's copy, matched by clientNonce, hides the pending one even when
//     the socket's event beats the reply;
//   - a failed send stays as "failed", and a retry runs the same send (the same
//     nonce, so the server answers with the first message, never a second);
//   - one conversation's sends go out one after another, in order;
//   - discard drops a failed send for good.
//
//   node scripts/check-pending-sends.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-pending-sends-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/features/workspace/hooks/chat/pending-sends.ts"),
        formats: ["es"],
        fileName: () => "pending-sends.mjs",
      },
    },
  });
  const sends = await import(pathToFileURL(path.join(outDir, "pending-sends.mjs")).href);
  const { pendingSends, startSend, retrySend, discardSend, pendingMessage, newClientNonce, withPendingMessages } = sends;
  const pending = () => pendingSends.getState().sends;

  const message = (scope, body) =>
    pendingMessage({ nonce: newClientNonce(), channel: scope, userId: "me", username: "Ben", body });

  // --- shown at once, gone once delivered -----------------------------------
  {
    const shown = message("lobby:a", "selam");
    let deliver;
    const done = startSend("lobby:a", shown, () => new Promise((resolve) => (deliver = resolve)));
    await tick();
    assert.equal(pending().length, 1);
    const view = withPendingMessages([], pending(), "lobby:a");
    assert.equal(view.length, 1);
    assert.equal(view[0].localState, "sending");
    assert.equal(view[0].body, "selam");
    assert.ok(view[0].id.startsWith("pending:"));
    assert.equal(withPendingMessages([], pending(), "lobby:b").length, 0, "a send showed in another conversation");

    // The socket's event arrives before the reply: the server's copy wins.
    const server = { id: "m1", body: "selam", clientNonce: shown.clientNonce };
    const both = withPendingMessages([server], pending(), "lobby:a");
    assert.deepEqual(both.map((entry) => entry.id), ["m1"], "the echoed message was shown twice");

    deliver(true);
    await done;
    assert.equal(pending().length, 0, "a delivered send stayed pending");
  }

  // --- failure, retry with the same send, discard ---------------------------
  {
    const shown = message("dm:u2", "naber");
    const nonces = [];
    let succeed = false;
    await startSend("dm:u2", shown, async () => {
      nonces.push(shown.clientNonce);
      return succeed;
    });
    assert.equal(pending()[0].state, "failed", "a failed send was not marked failed");
    assert.equal(withPendingMessages([], pending(), "dm:u2")[0].localState, "failed");

    succeed = true;
    await retrySend(shown.clientNonce);
    assert.equal(nonces.length, 2);
    assert.equal(nonces[0], nonces[1], "a retry did not reuse the nonce");
    assert.equal(pending().length, 0, "a retried send that went through stayed");

    const dropped = message("dm:u2", "boş ver");
    await startSend("dm:u2", dropped, async () => false);
    discardSend(dropped.clientNonce);
    assert.equal(pending().length, 0, "discard left the send");
    await retrySend(dropped.clientNonce); // nothing to retry: no error
  }

  // --- one conversation, in order ------------------------------------------
  {
    const order = [];
    let releaseFirst;
    const first = startSend("lobby:c", message("lobby:c", "1"), async () => {
      order.push("first started");
      await new Promise((resolve) => (releaseFirst = resolve));
      order.push("first done");
      return true;
    });
    const second = startSend("lobby:c", message("lobby:c", "2"), async () => {
      order.push("second started");
      return true;
    });
    await tick();
    assert.deepEqual(order, ["first started"], "the second send went out while the first was in flight");
    assert.deepEqual(
      withPendingMessages([], pending(), "lobby:c").map((entry) => entry.body),
      ["1", "2"],
      "queued sends are not both on screen in order",
    );
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first started", "first done", "second started"]);
    assert.equal(pending().length, 0);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("pending-sends self-check passed (shown at once, matched by nonce, retry with the same nonce, in order, discard)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
