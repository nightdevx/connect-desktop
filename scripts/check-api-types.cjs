#!/usr/bin/env node
// src/shared/generated is a verbatim copy of the backend's contracts/: the
// TypeScript tygo generates from the Go structs behind the API and the
// websockets. src/shared/api-contracts.ts binds this app's own types to it, so
// the binding is only as good as the copy is current. This compares the copy
// with the backend's files when the backend is checked out.
//
//   node scripts/check-api-types.cjs           compare
//   node scripts/check-api-types.cjs --write   copy them over (pnpm api-types:sync)

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = require("./backend-dir.cjs");

const copyDir = path.join(__dirname, "..", "src", "shared", "generated");
const sourceDir = path.join(backendRoot, "contracts");
const write = process.argv.includes("--write");

if (!fs.existsSync(sourceDir)) {
  if (write) {
    console.error(`check-api-types: ${sourceDir} does not exist; set CONNECT_BACKEND_DIR to the backend checkout`);
    process.exit(1);
  }
  console.log(
    "check-api-types: connect-backend is not checked out beside this repo — " +
      "the generated API types were NOT compared with it (set CONNECT_BACKEND_DIR to the backend checkout)",
  );
  process.exit(0);
}

const tsFiles = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".ts")).sort() : [];
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const sources = tsFiles(sourceDir);
assert.ok(sources.length > 0, `check-api-types: ${sourceDir} holds no generated files`);

if (write) {
  fs.rmSync(copyDir, { recursive: true, force: true });
  fs.mkdirSync(copyDir, { recursive: true });
  for (const name of sources) {
    fs.writeFileSync(path.join(copyDir, name), read(path.join(sourceDir, name)));
  }
  console.log(`check-api-types: copied ${sources.join(", ")} from ${sourceDir}`);
  process.exit(0);
}

assert.deepEqual(
  tsFiles(copyDir),
  sources,
  "check-api-types: src/shared/generated does not hold the backend's contracts/ files; run pnpm api-types:sync",
);
for (const name of sources) {
  assert.ok(
    read(path.join(copyDir, name)) === read(path.join(sourceDir, name)),
    `check-api-types: src/shared/generated/${name} differs from the backend's contracts/${name}; run pnpm api-types:sync`,
  );
}
console.log(`check-api-types: ok (${sources.length} files match ${sourceDir})`);
