#!/usr/bin/env node
// Self-check for src/renderer/src/features/workspace/mentions.tsx.
//
// Two of these rules are load-bearing and both fail silently when broken:
//
//   * mentionsUser is what lets a message through "Rahatsız etmeyin". A regex
//     that stops matching means the user simply never hears about being named,
//     and nothing anywhere reports an error.
//   * applyMention's trailing space is the whole reason "@ayse @mehmet" works.
//     findActiveMention only opens the picker when "@" follows whitespace, so
//     dropping that space quietly breaks tagging a second person.
//
//   node scripts/check-mentions.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-mentions-"));

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
          "src/renderer/src/features/workspace/mentions.tsx",
        ),
        formats: ["es"],
        fileName: () => "mentions.mjs",
      },
      rollupOptions: { external: ["react", "react/jsx-runtime"] },
    },
  });

  const {
    mentionsUser,
    findActiveMention,
    filterMentionCandidates,
    applyMention,
  } = await import(pathToFileURL(path.join(outDir, "mentions.mjs")).href);

  // --- mentionsUser: the notification gate --------------------------------
  assert.equal(mentionsUser("selam @ayse bakar mısın", "ayse"), true);
  assert.equal(mentionsUser("@ayse", "ayse"), true, "start of message counts");
  assert.equal(mentionsUser("bitti @ayse", "ayse"), true, "end of message counts");
  assert.equal(mentionsUser("@AYSE geldi", "ayse"), true, "case-insensitive");
  assert.equal(mentionsUser("@ayse @mehmet", "mehmet"), true, "second of two");
  assert.equal(
    mentionsUser("@aysenur geldi", "ayse"),
    false,
    "a longer username must not match a shorter one",
  );
  assert.equal(mentionsUser("ayse geldi", "ayse"), false, "no @, no mention");
  assert.equal(mentionsUser("selam", ""), false, "empty username never matches");
  assert.equal(
    mentionsUser("mail: ayse@example.com", "example"),
    false,
    "an e-mail address is not a mention of its domain",
  );

  // --- findActiveMention: when the picker opens ----------------------------
  const atEnd = findActiveMention("selam @ay", 9);
  assert.ok(atEnd, "typing @ay must open the picker");
  assert.equal(atEnd.query, "ay");
  assert.equal(atEnd.start, 6, "start points at the @");
  assert.equal(atEnd.end, 9);

  const bare = findActiveMention("@", 1);
  assert.ok(bare, "a bare @ opens the picker with everyone");
  assert.equal(bare.query, "");

  assert.equal(
    findActiveMention("ayse@example", 12),
    null,
    "an @ mid-word is an e-mail, not a mention",
  );
  assert.equal(
    findActiveMention("selam @ayse dedi", 16),
    null,
    "the caret has left the token",
  );

  // --- filterMentionCandidates --------------------------------------------
  const people = [
    { userId: "1", username: "ayse", displayName: "Ayşe Y." },
    { userId: "2", username: "aysenur", displayName: "Ayşenur" },
    { userId: "3", username: "mehmet", displayName: "Mehmet" },
    { userId: "1", username: "ayse", displayName: "Ayşe Y." },
  ];
  assert.equal(filterMentionCandidates(people, "").length, 3, "duplicates drop");
  assert.deepEqual(
    filterMentionCandidates(people, "ays").map((p) => p.username),
    ["ayse", "aysenur"],
  );
  assert.deepEqual(
    filterMentionCandidates(people, "meh").map((p) => p.username),
    ["mehmet"],
  );
  assert.equal(filterMentionCandidates(people, "zzz").length, 0);

  // --- applyMention: successive tagging ------------------------------------
  const first = applyMention("selam @ay", findActiveMention("selam @ay", 9), "ayse");
  assert.equal(first.value, "selam @ayse ", "the trailing space is required");
  assert.equal(first.caret, 12);

  // ...and that space is exactly what lets the next @ open the picker again.
  const second = findActiveMention(`${first.value}@meh`, first.value.length + 4);
  assert.ok(second, "@ after an inserted mention must open the picker");
  assert.equal(second.query, "meh");
  const both = applyMention(
    `${first.value}@meh`,
    second,
    "mehmet",
  );
  assert.equal(both.value, "selam @ayse @mehmet ");
  assert.equal(mentionsUser(both.value, "ayse"), true);
  assert.equal(mentionsUser(both.value, "mehmet"), true);

  // Replacing mid-sentence must not eat the text after the caret.
  const middle = "bak @ay sonra gel";
  const mid = applyMention(middle, findActiveMention(middle, 7), "ayse");
  assert.equal(mid.value, "bak @ayse  sonra gel");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("mentions self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
