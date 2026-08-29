#!/usr/bin/env node
// Self-check for the "Yenilikler" changelog.
//
// Two kinds of failure, both silent and both only visible to a user who has
// already updated:
//
//   1. The version comparison. These strings are compared to decide what
//      somebody is shown, and a string compare gets "0.1.9" > "0.1.75" right
//      alphabetically and wrong in every other sense -- which would hide every
//      note from the tenth patch release onwards and never say so.
//   2. The changelog data itself. A note whose version does not match a real
//      release, or a duplicate entry, or a list left in the wrong order: all of
//      them typecheck, and all of them read as "the update showed me nothing".
//
// The module imports only the local data, so it bundles with no React or DOM.
// localStorage is stood up because the same file owns the seen-marker. Output
// goes under node_modules/.cache for the reason check-view-preferences.cjs
// documents: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-release-notes.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const installStorage = () => {
  const store = new Map();
  let failing = false;

  globalThis.localStorage = {
    getItem: (key) => {
      if (failing) throw new Error("storage is denied");
      return store.has(key) ? store.get(key) : null;
    },
    setItem: (key, value) => {
      if (failing) throw new Error("storage is denied");
      store.set(key, String(value));
    },
  };

  return {
    clear: () => store.clear(),
    setFailing: (value) => {
      failing = value;
    },
  };
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-release-notes-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/release-notes/release-notes.ts",
        ),
        formats: ["es"],
        fileName: () => "release-notes.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const storage = installStorage();
  const bundle = path.join(outDir, "release-notes.mjs");
  const {
    RELEASE_NOTES,
    RELEASE_HIGHLIGHT_LABELS,
    compareVersions,
    notesSince,
    notesUpTo,
    readLastSeenVersion,
    saveLastSeenVersion,
  } = await import(pathToFileURL(bundle).href);

  // --- the comparison -------------------------------------------------------
  assert.ok(compareVersions("1.0.0", "1.0.0") === 0, "equal versions compare equal");
  assert.ok(compareVersions("1.0.1", "1.0.0") > 0, "a later patch is greater");
  assert.ok(compareVersions("1.0.0", "1.0.1") < 0, "an earlier patch is smaller");
  assert.ok(compareVersions("1.1.0", "1.0.9") > 0, "minor beats patch");
  assert.ok(compareVersions("2.0.0", "1.9.9") > 0, "major beats minor");

  // The one a string compare gets backwards, and the whole reason this file
  // exists: "0.1.9" sorts after "0.1.75" alphabetically.
  assert.ok(
    compareVersions("0.1.75", "0.1.9") > 0,
    "0.1.75 is a LATER release than 0.1.9 — a string compare says otherwise",
  );

  // Shapes that turn up in the wild: a prerelease suffix, a short version, and
  // trailing whitespace out of a config file.
  assert.equal(compareVersions("1.2.0-beta.1", "1.2.0"), 0, "a prerelease suffix is dropped");
  assert.ok(compareVersions("1.2", "1.2.0") === 0, "a missing part counts as zero");
  assert.ok(compareVersions(" 1.3.0 ", "1.2.0") > 0, "whitespace is trimmed");

  // --- the changelog data ---------------------------------------------------
  assert.ok(RELEASE_NOTES.length > 0, "there must be at least one release note");

  const kinds = new Set(Object.keys(RELEASE_HIGHLIGHT_LABELS));
  const seenVersions = new Set();

  for (const [index, note] of RELEASE_NOTES.entries()) {
    const where = `RELEASE_NOTES[${index}] (${note.version})`;

    assert.match(note.version, /^\d+(\.\d+)*(-[\w.]+)?$/, `${where}: not a version string`);
    assert.ok(!seenVersions.has(note.version), `${where}: duplicate version`);
    seenVersions.add(note.version);

    assert.ok(
      Number.isFinite(Date.parse(note.date)),
      `${where}: date "${note.date}" is not parseable`,
    );

    assert.ok(note.highlights.length > 0, `${where}: a release note with no highlights`);
    for (const highlight of note.highlights) {
      assert.ok(
        kinds.has(highlight.kind),
        `${where}: unknown highlight kind "${highlight.kind}"`,
      );
      assert.ok(
        typeof highlight.text === "string" && highlight.text.trim() !== "",
        `${where}: an empty highlight`,
      );
    }

    // Newest first. The dialog renders them in array order, so a list sorted the
    // other way puts the oldest release at the top of what is meant to be news.
    if (index > 0) {
      const previous = RELEASE_NOTES[index - 1];
      assert.ok(
        compareVersions(previous.version, note.version) > 0,
        `${where}: comes after ${previous.version}, but is not older than it — the list is newest-first`,
      );
    }
  }

  // The newest note has to be a release that exists, or the dialog it belongs to
  // can never open: notesSince() refuses to show a version this build has not
  // reached.
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ).version;
  assert.ok(
    compareVersions(RELEASE_NOTES[0].version, packageVersion) <= 0,
    `the newest note is v${RELEASE_NOTES[0].version} but package.json ships ${packageVersion} — nobody would ever be shown it`,
  );

  // --- who gets shown what --------------------------------------------------
  const newest = RELEASE_NOTES[0].version;
  const oldest = RELEASE_NOTES[RELEASE_NOTES.length - 1].version;

  assert.deepEqual(
    notesSince(newest, newest).map((n) => n.version),
    [],
    "somebody already on the newest release is shown nothing",
  );

  assert.deepEqual(
    notesSince(newest, null).map((n) => n.version),
    [newest],
    "a profile with no marker gets the notes for the version it is running, and nothing older",
  );

  assert.deepEqual(
    notesSince(newest, "0.0.0").map((n) => n.version),
    RELEASE_NOTES.map((n) => n.version),
    "somebody arriving from before every release gets all of them",
  );

  // Skipping releases is the normal case: the updater is silent.
  if (RELEASE_NOTES.length > 1) {
    assert.deepEqual(
      notesSince(newest, oldest).map((n) => n.version),
      RELEASE_NOTES.slice(0, -1).map((n) => n.version),
      "everything after the marker, not only the newest",
    );
  }

  // A changelog written before the release goes out must not leak.
  assert.deepEqual(
    notesSince(oldest, "0.0.0").map((n) => n.version),
    [oldest],
    "a note for a version this build has not reached is not shown",
  );

  assert.deepEqual(notesSince(null, null), [], "no version, no dialog");
  assert.deepEqual(notesSince(undefined, null), [], "no version, no dialog");

  // --- reopening it by hand -------------------------------------------------
  // The question-mark button beside the version reads the whole changelog
  // rather than only what is new, but it is bounded the same way: a note
  // written before its release goes out must not be readable from a build that
  // has not reached it.
  assert.deepEqual(
    notesUpTo(newest).map((n) => n.version),
    RELEASE_NOTES.map((n) => n.version),
    "the newest build can read every note",
  );

  assert.deepEqual(
    notesUpTo(oldest).map((n) => n.version),
    [oldest],
    "an older build must not read a note for a release it has not reached",
  );

  assert.deepEqual(notesUpTo(null), [], "no version, nothing to reopen");
  assert.deepEqual(notesUpTo(undefined), [], "no version, nothing to reopen");

  // --- the seen-marker ------------------------------------------------------
  storage.clear();
  assert.equal(readLastSeenVersion(), null, "nothing stored reads as null");
  saveLastSeenVersion("1.2.3");
  assert.equal(readLastSeenVersion(), "1.2.3", "what was saved is what comes back");

  storage.setFailing(true);
  assert.equal(
    readLastSeenVersion(),
    null,
    "a storage that throws on read must not take the launch down with it",
  );
  saveLastSeenVersion("1.2.4");
  storage.setFailing(false);
  storage.clear();

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `release-notes self-check passed (${RELEASE_NOTES.length} release${RELEASE_NOTES.length === 1 ? "" : "s"}, newest v${newest})`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
