#!/usr/bin/env node
// Self-check for src/renderer/src/store/view-preferences.ts.
//
// These booleans decide whether a pane is on screen, and they are read back from
// a string somebody's browser profile has been carrying since an older version of
// the app. Every failure here is silent and looks like a bug in the panel: a key
// that reads back as undefined renders the pane closed with no way to tell that
// the preference, rather than the layout, is what broke.
//
// The module imports nothing, so it bundles with no electron, React or DOM --
// only localStorage has to be stood up, which is the point of half these cases.
// Output goes under node_modules/.cache for the same reason
// check-publish-plan.cjs does: bare specifiers cannot resolve from a system temp
// directory.
//
//   node scripts/check-view-preferences.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// A localStorage that can be pointed at a value, and made to throw the way a
// locked-down profile does.
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
    put: (value) => store.set("ct.settings.view", value),
    read: () => store.get("ct.settings.view"),
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
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-view-preferences-"));

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
        entry: path.join(projectRoot, "src/renderer/src/store/view-preferences.ts"),
        formats: ["es"],
        fileName: () => "view-preferences.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const storage = installStorage();
  const bundle = path.join(outDir, "view-preferences.mjs");
  const {
    readViewPreferences,
    saveViewPreferences,
    DEFAULT_VIEW_PREFERENCES,
  } = await import(pathToFileURL(bundle).href);

  const keys = Object.keys(DEFAULT_VIEW_PREFERENCES);
  assert.ok(keys.length > 0, "there must be at least one view preference");

  // --- every key is a boolean, always ---------------------------------------
  // This is the invariant the panels rely on. `!isLobbyChatOpen` on an undefined
  // is true, so a missing key does not fail loudly -- it silently flips a pane.
  const assertAllBooleans = (result, label) => {
    for (const key of keys) {
      assert.equal(
        typeof result[key],
        "boolean",
        `${label}: ${key} came back as ${typeof result[key]}`,
      );
    }
  };

  // --- nothing stored yet ---------------------------------------------------
  assertAllBooleans(readViewPreferences(), "first launch");
  assert.deepEqual(
    readViewPreferences(),
    DEFAULT_VIEW_PREFERENCES,
    "a profile with nothing stored gets the defaults",
  );

  // --- a round trip ---------------------------------------------------------
  const inverted = Object.fromEntries(keys.map((key) => [key, false]));
  saveViewPreferences(inverted);
  assert.deepEqual(
    readViewPreferences(),
    inverted,
    "what was saved is what comes back",
  );

  // --- a blob written before a key existed ----------------------------------
  // The real upgrade path: someone has been running an older build, and the
  // stored object is missing whatever was added since.
  storage.put(JSON.stringify({ [keys[0]]: false }));
  const partial = readViewPreferences();
  assertAllBooleans(partial, "partial blob");
  assert.equal(partial[keys[0]], false, "a stored key is honoured");
  for (const key of keys.slice(1)) {
    assert.equal(
      partial[key],
      DEFAULT_VIEW_PREFERENCES[key],
      `${key} was absent from storage and must fall back to its default`,
    );
  }

  // --- values of the wrong type are not trusted ------------------------------
  storage.put(
    JSON.stringify(Object.fromEntries(keys.map((key) => [key, "false"]))),
  );
  assert.deepEqual(
    readViewPreferences(),
    DEFAULT_VIEW_PREFERENCES,
    'the string "false" is not the boolean false and must not be taken as one',
  );

  // --- corrupt or hostile storage -------------------------------------------
  for (const raw of ["not json at all", "null", '"a string"', "[]", "42"]) {
    storage.put(raw);
    assertAllBooleans(readViewPreferences(), `stored value ${raw}`);
  }

  // --- storage that refuses ---------------------------------------------------
  // A locked-down profile costs the user the preference, never the launch.
  storage.setFailing(true);
  assert.deepEqual(
    readViewPreferences(),
    DEFAULT_VIEW_PREFERENCES,
    "a storage that throws on read must not take the app down with it",
  );
  saveViewPreferences(DEFAULT_VIEW_PREFERENCES);
  storage.setFailing(false);
  storage.clear();

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`view-preferences self-check passed (${keys.length} keys)`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
