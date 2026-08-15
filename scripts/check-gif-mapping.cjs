#!/usr/bin/env node
// Self-check for toGifItem in src/main/clients/klipy-client.ts.
//
// This one exists because of a bug that would have shipped invisibly. The
// mapper was written from a third-party article that said GIF media lives under
// `files`; KLIPY actually returns `file`, singular. Reading the wrong key
// walked undefined, so every row mapped to null and the picker answered
// "Sonuç bulunamadı" for every query -- identical to a genuinely empty search,
// with nothing logged. No type error, no failing build. It was only caught by
// making a live call once an API key existed.
//
// So the fixture below is a REAL row, captured from
// GET https://api.klipy.com/api/v1/<key>/gifs/trending on 2026-08-14, trimmed
// to two tiers. Anything that stops reading this shape fails here instead of
// silently returning an empty grid to the user.
//
// The module imports DesktopApiError from ./base-client (self-contained, no
// electron), so it bundles cleanly. Output goes under node_modules/.cache for
// the same reason check-publish-plan.cjs does: bare specifiers cannot resolve
// from a system temp directory.
//
//   node scripts/check-gif-mapping.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// One real row. `hd`/`sm` keep all five formats because the format list is the
// point: every tier carries gif AND mp4/webm at identical dimensions, which is
// why ranking variants by pixel area picked a video often enough to matter.
const REAL_ROW = {
  id: 5122930761797986,
  slug: "good-night-sweet-dreams-709",
  title: "Good Night Sweet Dreams with Sleeping Puppies",
  file: {
    hd: {
      gif: { url: "https://static.klipy.com/ii/abc/5a/7f/Gfzf7kvq.gif", width: 400, height: 400, size: 804608 },
      webp: { url: "https://static.klipy.com/ii/abc/5a/7f/SmULmKEU.webp", width: 400, height: 400, size: 547452 },
      jpg: { url: "https://static.klipy.com/ii/abc/5a/7f/d4QalTEY.jpg", width: 400, height: 400, size: 30011 },
      mp4: { url: "https://static.klipy.com/ii/abc/5a/7f/8Jrqss3u.mp4", width: 400, height: 400, size: 170512 },
      webm: { url: "https://static.klipy.com/ii/abc/5a/7f/VHZbnsn6.webm", width: 400, height: 400, size: 140367 },
    },
    sm: {
      gif: { url: "https://static.klipy.com/ii/abc/5a/7f/kK6WN497.gif", width: 220, height: 220, size: 306148 },
      webp: { url: "https://static.klipy.com/ii/abc/5a/7f/M8chkGll.webp", width: 220, height: 220, size: 575272 },
      mp4: { url: "https://static.klipy.com/ii/abc/5a/7f/Dhpzcm5l.mp4", width: 320, height: 320, size: 107010 },
    },
  },
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-gif-mapping-"));

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
        entry: path.join(projectRoot, "src/main/clients/klipy-client.ts"),
        formats: ["es"],
        fileName: () => "klipy-client.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "klipy-client.mjs");
  const { toGifItem } = await import(pathToFileURL(bundle).href);

  // --- the real row maps ---------------------------------------------------
  const rejected = new Set();
  const item = toGifItem(REAL_ROW, rejected);

  assert.ok(
    item,
    "the recorded KLIPY row must map -- a null here is the `files` vs `file` bug returning",
  );
  assert.equal(item.previewUrl, REAL_ROW.file.sm.gif.url, "sm is the grid preview");
  assert.equal(item.sendUrl, REAL_ROW.file.hd.gif.url, "hd is what goes into the message");
  assert.equal(item.description, REAL_ROW.title, "title carries the description, not content_description");
  assert.equal(item.id, "5122930761797986", "id arrives as a number and must survive as a string");
  assert.equal(rejected.size, 0, "every URL in a real row is provider-hosted");

  // --- only ever the gif sub-key -------------------------------------------
  // The chat renderer auto-loads image extensions only, so a video URL in the
  // message body renders as a bare text link instead of a GIF.
  for (const url of [item.previewUrl, item.sendUrl]) {
    assert.match(url, /\.gif$/, `${url} must be the gif variant, never mp4/webm/webp/jpg`);
  }

  // --- tier fallback --------------------------------------------------------
  const smOnly = { ...REAL_ROW, file: { sm: REAL_ROW.file.sm } };
  const fallback = toGifItem(smOnly, new Set());
  assert.equal(fallback.sendUrl, REAL_ROW.file.sm.gif.url, "send falls back down the tiers when hd is absent");

  // A tier that carries only video has no gif to take, so the row is dropped
  // rather than sent as an unrenderable link.
  const videoOnly = { ...REAL_ROW, file: { hd: { mp4: REAL_ROW.file.hd.mp4 } } };
  assert.equal(toGifItem(videoOnly, new Set()), null, "a row with no gif variant is dropped");

  // --- the host allowlist is still the boundary ----------------------------
  // A redirecting or compromised upstream must not get a third-party URL into a
  // message body, because that body is what every client auto-loads.
  const hostile = {
    ...REAL_ROW,
    file: {
      sm: { gif: { url: "https://klipy.com.evil.tld/x.gif", width: 220, height: 220 } },
      hd: { gif: { url: "https://static.klipy.com@evil.tld/x.gif", width: 400, height: 400 } },
    },
  };
  const hostileRejected = new Set();
  assert.equal(
    toGifItem(hostile, hostileRejected),
    null,
    "a lookalike host must not map -- matching has to be on the parsed hostname",
  );
  assert.ok(hostileRejected.size > 0, "a rejected URL records its host for the diagnostic");
  assert.ok(
    ![...hostileRejected].some((host) => host.includes("/")),
    "the diagnostic records hostnames only, never a URL (the API key is a path segment)",
  );

  // --- junk in, null out ----------------------------------------------------
  for (const junk of [null, undefined, 42, "gif", {}, { file: null }, { file: {} }]) {
    assert.equal(toGifItem(junk, new Set()), null, `unmappable input must return null: ${JSON.stringify(junk)}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("gif-mapping self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
