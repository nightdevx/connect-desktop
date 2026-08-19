#!/usr/bin/env node
// Structural rules for src/, enforced instead of merely documented.
//
// Every rule here is one that typecheck and lint both pass happily while the
// app is wrong — either at runtime, or the next time somebody moves a folder.
// They are static: this reads import specifiers, it does not run anything.
//
//   node scripts/check-architecture.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const srcRoot = path.join(projectRoot, "src");

const rel = (file) => path.relative(projectRoot, file).replace(/\\/g, "/");

const sources = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      sources.push(full);
    }
  }
};
walk(srcRoot);

const text = new Map(sources.map((file) => [file, fs.readFileSync(file, "utf8")]));

// `import x from "y"`, `export * from "y"`, and bare `import "y"` alike.
const readSpecifiers = (source) => {
  const found = [];
  const pattern = /(?:from|import)\s+["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(source)) !== null) found.push(match[1]);
  return found;
};

const isFile = (candidate) =>
  fs.existsSync(candidate) && fs.statSync(candidate).isFile();

// Mirrors the tsconfig paths and Vite's alias block. Bare package specifiers
// resolve to null, which every rule below treats as "not our problem".
const resolveSpecifier = (fromFile, specifier) => {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(srcRoot, "renderer/src", specifier.slice(2));
  } else if (specifier.startsWith("@shared/")) {
    base = path.join(srcRoot, "shared", specifier.slice("@shared/".length));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const extension of [".ts", ".tsx"]) {
    if (isFile(base + extension)) return base + extension;
  }
  for (const extension of [".ts", ".tsx"]) {
    const asIndex = path.join(base, `index${extension}`);
    if (isFile(asIndex)) return asIndex;
  }
  return isFile(base) ? base : null;
};

const graph = new Map();
for (const file of sources) {
  const deps = new Set();
  for (const specifier of readSpecifiers(text.get(file))) {
    const target = resolveSpecifier(file, specifier);
    if (target && target !== file) deps.add(target);
  }
  graph.set(file, [...deps]);
}

const failures = [];
const fail = (rule, detail) => failures.push(`[${rule}] ${detail}`);

// --- 1. No import cycles -------------------------------------------------
// A cycle is the failure that survives every other check: TypeScript resolves
// it, the bundler emits it, and it shows up at runtime as a module whose
// exports are undefined at the moment the other half of the cycle reads them.
{
  const state = new Map();
  const stack = [];
  const seen = new Set();

  const visit = (node) => {
    state.set(node, "open");
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (state.get(dep) === "open") {
        const cycle = stack.slice(stack.indexOf(dep)).concat(dep).map(rel);
        const key = [...new Set(cycle)].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          fail("cycle", cycle.join(" -> "));
        }
      } else if (!state.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    state.set(node, "done");
  };

  for (const file of sources) if (!state.has(file)) visit(file);
}

// --- 2. The composition root is a leaf ------------------------------------
// src/renderer/src/app is where the application is assembled: it is the only
// place allowed to know about every feature at once. A feature importing back
// out of it inverts that and produces a cycle the moment two features do it.
{
  const appRoot = path.join(srcRoot, "renderer/src/app");
  for (const [file, deps] of graph) {
    if (!file.includes(`${path.sep}features${path.sep}`)) continue;
    for (const dep of deps) {
      if (dep.startsWith(appRoot + path.sep)) {
        fail("app-is-a-leaf", `${rel(file)} imports ${rel(dep)}`);
      }
    }
  }
}

// --- 3. Features talk through their front doors ---------------------------
// Reaching past a sibling feature's index.ts couples this file to that
// feature's internal layout, so moving a file inside one feature breaks
// another. Its own internals are its own business — only CROSS-feature imports
// are checked.
{
  const featuresRoot = path.join(srcRoot, "renderer/src/features");
  const featureOf = (file) => {
    if (!file.startsWith(featuresRoot + path.sep)) return null;
    return path.relative(featuresRoot, file).split(path.sep)[0];
  };

  for (const [file, deps] of graph) {
    const owner = featureOf(file);
    for (const dep of deps) {
      const target = featureOf(dep);
      if (!target || target === owner) continue;

      const barrel = path.join(featuresRoot, target, "index.ts");
      if (dep !== barrel) {
        fail(
          "feature-barrel",
          `${rel(file)} reaches into ${rel(dep)} — import from "@/features/${target}" instead`,
        );
      }
    }
  }
}

// --- 4. Every feature HAS a front door ------------------------------------
{
  const featuresRoot = path.join(srcRoot, "renderer/src/features");
  for (const entry of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert.ok(
      isFile(path.join(featuresRoot, entry.name, "index.ts")),
      `feature "${entry.name}" has no index.ts — nothing defines what it exposes`,
    );
  }
}

// --- 5. The two processes share only src/shared ---------------------------
// They are separate programs. A main-process module pulled into the renderer
// bundle would drag Node built-ins into a browser context; the reverse pulls
// the DOM into a process that has none.
{
  const mainRoot = path.join(srcRoot, "main");
  const rendererRoot = path.join(srcRoot, "renderer");
  for (const [file, deps] of graph) {
    const fromMain = file.startsWith(mainRoot + path.sep);
    const fromRenderer = file.startsWith(rendererRoot + path.sep);
    for (const dep of deps) {
      if (fromMain && dep.startsWith(rendererRoot + path.sep)) {
        fail("process-boundary", `${rel(file)} imports renderer code ${rel(dep)}`);
      }
      if (fromRenderer && dep.startsWith(mainRoot + path.sep)) {
        fail("process-boundary", `${rel(file)} imports main-process code ${rel(dep)}`);
      }
    }
  }
}

// --- 6. Aliases are a bundler feature, and main is not bundled ------------
// tsconfig `paths` are compile-time only. src/main is emitted as plain
// CommonJS and required by Node, which has never heard of "@shared/..." — so
// this typechecks, builds, ships, and throws MODULE_NOT_FOUND on launch. Only
// the renderer goes through Vite, where the alias is real.
{
  const bundled = path.join(srcRoot, "renderer");
  for (const file of sources) {
    if (file.startsWith(bundled + path.sep)) continue;
    for (const specifier of readSpecifiers(text.get(file))) {
      if (specifier.startsWith("@/") || specifier.startsWith("@shared/")) {
        fail(
          "no-alias-outside-bundle",
          `${rel(file)} imports "${specifier}" — outside the Vite bundle, use a relative path`,
        );
      }
    }
  }
}

// --- 7. The renderer uses the alias rather than climbing out --------------
// `../../../../../shared/x` and `@shared/x` are the same module, but only one
// of them survives a file being moved one directory. The alias is already the
// convention; this stops the other form coming back.
{
  const rendererSrc = path.join(srcRoot, "renderer/src");
  const sharedRoot = path.join(srcRoot, "shared");
  const storeRoot = path.join(rendererSrc, "store");

  for (const file of sources) {
    if (!file.startsWith(rendererSrc + path.sep)) continue;
    for (const specifier of readSpecifiers(text.get(file))) {
      if (!specifier.startsWith("../")) continue;

      // Resolved, not pattern-matched. A feature with its own store/ folder
      // beside its hooks/ is reaching one directory sideways, not climbing out
      // to the app-level one — and the string "../store/" cannot tell those
      // apart. Matching on the name alone told the livekit feature to import
      // its own store through @/store, which is a different module.
      const target = resolveSpecifier(file, specifier);
      if (!target) continue;

      if (target.startsWith(sharedRoot + path.sep)) {
        fail("prefer-alias", `${rel(file)} imports "${specifier}" — use @shared/...`);
      } else if (target.startsWith(storeRoot + path.sep)) {
        fail("prefer-alias", `${rel(file)} imports "${specifier}" — use @/store/...`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`architecture self-check FAILED (${failures.length}):`);
  for (const failure of failures) console.error("  " + failure);
  process.exit(1);
}

console.log(
  `architecture self-check passed (${sources.length} modules, 7 rules)`,
);
