"use strict";

/**
 * The design-token contract, enforced.
 *
 * Two failures this catches, both of which shipped before it existed:
 *
 *   1. A `var(--ct-something)` that no stylesheet declares. CSS does not warn --
 *      the declaration is simply invalid and dropped, or the literal fallback
 *      paints instead. The @mention picker referenced --ct-surface-overlay,
 *      which was declared nowhere, so it painted its hardcoded dark fallback in
 *      the light theme for as long as the light theme existed.
 *
 *   2. A token declared and then referenced by nobody. Four "legacy aliases"
 *      outlived the stylesheets that used them and sat in base.css describing a
 *      migration that had already finished.
 *
 * Both directions matter: the first is a visible bug, the second is a stale map
 * of the palette that the next person styles against.
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RENDERER = path.join(__dirname, "..", "src", "renderer", "src");
const STYLES = path.join(RENDERER, "styles");
const TAILWIND_CONFIG = path.join(__dirname, "..", "tailwind.config.cjs");

const TOKEN = /--ct-[a-zA-Z0-9-]+/;
const DECLARATION = /^\s*(--ct-[a-zA-Z0-9-]+)\s*:/;
const REFERENCE = /var\(\s*(--ct-[a-zA-Z0-9-]+)/g;

function walk(dir, test) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full, test);
    }
    return test(full) ? [full] : [];
  });
}

const cssFiles = walk(STYLES, (f) => f.endsWith(".css"));
const codeFiles = walk(RENDERER, (f) => /\.tsx?$/.test(f));

const declared = new Set();
const referenced = new Map();

function noteReference(token, where) {
  if (!referenced.has(token)) {
    referenced.set(token, []);
  }
  referenced.get(token).push(where);
}

for (const file of cssFiles) {
  const rel = path.relative(path.join(__dirname, ".."), file);
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      const declaration = line.match(DECLARATION);
      if (declaration) {
        declared.add(declaration[1]);
      }
      // A token used inside another token's value still counts as a use: that
      // is how --ct-shadow-glow consumes --ct-accent-glow.
      for (const match of line.matchAll(REFERENCE)) {
        noteReference(match[1], `${rel}:${index + 1}`);
      }
    });
}

// Inline style={{}} is the one place a stylesheet cannot reach, so the colour
// maps in TS reference tokens through var() too.
for (const file of codeFiles) {
  const rel = path.relative(path.join(__dirname, ".."), file);
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const match of line.matchAll(REFERENCE)) {
        noteReference(match[1], `${rel}:${index + 1}`);
      }
    });
}

// Tailwind is a view onto the same tokens: `h-avatar-md` is the only consumer
// of --ct-avatar-md, and it never appears as var() in any stylesheet.
const tailwindSource = fs.readFileSync(TAILWIND_CONFIG, "utf8");
for (const match of tailwindSource.matchAll(REFERENCE)) {
  noteReference(match[1], "tailwind.config.cjs");
}

const undefinedTokens = [...referenced.keys()]
  .filter((token) => !declared.has(token))
  .sort();

assert.deepStrictEqual(
  undefinedTokens,
  [],
  `referenced but never declared -- these paint their fallback or nothing at all:\n${undefinedTokens
    .map((token) => `  ${token}  <- ${referenced.get(token).join(", ")}`)
    .join("\n")}`,
);

const unusedTokens = [...declared]
  .filter((token) => !referenced.has(token))
  .sort();

assert.deepStrictEqual(
  unusedTokens,
  [],
  `declared but referenced by nothing -- delete them or wire them up:\n${unusedTokens
    .map((token) => `  ${token}`)
    .join("\n")}`,
);

// The regex is the whole check; if it stops matching a token the two sets above
// go empty and every assertion passes vacuously.
assert.ok(declared.size > 50, `expected a real palette, found ${declared.size}`);
assert.ok(TOKEN.test("--ct-surface-1"), "token pattern no longer matches a token");
assert.strictEqual(
  DECLARATION.test("  --ct-accent: #fff;"),
  true,
  "declaration pattern no longer matches a declaration",
);
assert.strictEqual(
  DECLARATION.test("  color: var(--ct-accent);"),
  false,
  "declaration pattern matches a plain reference",
);

console.log(
  `design-tokens self-check passed (${declared.size} declared, all referenced, none missing)`,
);
