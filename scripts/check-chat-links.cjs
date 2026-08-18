#!/usr/bin/env node
// Self-check for the chat link splitter in
// src/renderer/src/features/workspace/chat-links.ts.
//
// This decides which part of a message becomes a clickable anchor. Two ways it
// can go wrong, and both reach the user as a broken message rather than a
// broken link: swallowing the sentence's punctuation into the href, and index
// arithmetic that drops or duplicates text around the match.
//
// So the check asserts the invariant first — the segments always re-join into
// the original body, character for character — and the cases after it.
//
// The module is pure — no React, no DOM — so it bundles standalone. Output goes
// under node_modules/.cache for the same reason check-speaking-state.cjs does:
// bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-chat-links.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-chat-links-"));

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
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/chat-links.ts",
        ),
        formats: ["es"],
        fileName: () => "chat-links.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "chat-links.mjs");
  const { segmentMessageBody, trimUrlTail, hrefForUrl } = await import(
    pathToFileURL(bundle).href
  );

  const linksIn = (body) =>
    segmentMessageBody(body)
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.value);

  // --- nothing may be lost or duplicated ------------------------------------
  const BODIES = [
    "",
    "düz mesaj, link yok",
    "https://ornek.com",
    "bak: https://ornek.com/a?b=1#c ve www.ornek.org sonra devam",
    "(bkz. https://ornek.com/a)",
    "https://tr.wikipedia.org/wiki/Deneme_(film)",
    "@ayse bak https://ornek.com/@mehmet/profil",
    "iki tane https://a.example ve https://b.example.",
    "https://ornek.com,https://ikinci.com",
    "sonda nokta https://ornek.com.",
  ];

  for (const body of BODIES) {
    const segments = segmentMessageBody(body);
    assert.equal(
      segments.map((segment) => segment.value).join(""),
      body,
      `segments must re-join into the original body: ${JSON.stringify(body)}`,
    );

    let expectedOffset = 0;
    for (const segment of segments) {
      assert.equal(
        segment.offset,
        expectedOffset,
        `offsets must be the real positions in ${JSON.stringify(body)}`,
      );
      assert.notEqual(segment.value, "", "empty segments are noise");
      expectedOffset += segment.value.length;
    }
  }

  // --- what counts as a link ------------------------------------------------
  assert.deepEqual(linksIn("https://ornek.com"), ["https://ornek.com"]);
  assert.deepEqual(linksIn("www.ornek.com"), ["www.ornek.com"]);
  assert.deepEqual(
    linksIn("iki tane https://a.example ve https://b.example."),
    ["https://a.example", "https://b.example"],
  );

  // A bare domain is not a link: this is the case that would turn every
  // "dosya.txt" and "3.14" in the room into something clickable.
  assert.deepEqual(linksIn("dosya.txt guncellendi"), []);
  assert.deepEqual(linksIn("pi yaklasik 3.14"), []);
  assert.deepEqual(linksIn("ornek.com"), []);

  // The scheme is what the OS browser opens; anything else must not become an
  // anchor at all.
  assert.deepEqual(linksIn("javascript:alert(1)"), []);
  assert.deepEqual(linksIn("file:///C:/Windows/System32"), []);
  assert.deepEqual(linksIn("data:text/html,<h1>hi</h1>"), []);

  // --- punctuation belongs to the sentence, not the href --------------------
  assert.equal(trimUrlTail("https://ornek.com."), "https://ornek.com");
  assert.equal(trimUrlTail("https://ornek.com),"), "https://ornek.com");
  assert.equal(trimUrlTail("https://ornek.com/a!?"), "https://ornek.com/a");
  assert.deepEqual(linksIn("(bkz. https://ornek.com/a)"), [
    "https://ornek.com/a",
  ]);
  // ...unless the address opened the bracket itself.
  assert.equal(
    trimUrlTail("https://tr.wikipedia.org/wiki/Deneme_(film)"),
    "https://tr.wikipedia.org/wiki/Deneme_(film)",
  );

  // A trailing "?" or "#" that IS part of the address survives only when
  // something follows it; a dangling one is sentence punctuation.
  assert.deepEqual(linksIn("bu mu https://ornek.com/a?b=1"), [
    "https://ornek.com/a?b=1",
  ]);

  // --- href ----------------------------------------------------------------
  assert.equal(hrefForUrl("www.ornek.com"), "https://www.ornek.com");
  assert.equal(hrefForUrl("http://ornek.com"), "http://ornek.com");
  assert.equal(hrefForUrl("https://ornek.com"), "https://ornek.com");
  for (const segment of segmentMessageBody("git www.ornek.com adresine")) {
    if (segment.kind === "link") {
      assert.ok(
        /^https?:\/\//i.test(segment.href),
        "every href must carry a scheme the OS browser can open",
      );
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `chat-links self-check passed (${BODIES.length} bodies re-join exactly, schemes bounded to http/https)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
