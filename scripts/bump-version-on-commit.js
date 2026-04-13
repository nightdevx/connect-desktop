const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageLockPath = path.join(repoRoot, "package-lock.json");

const VERSION_FILES = new Set(["package.json", "package-lock.json"]);

const getStagedFiles = () => {
  const output = execSync("git diff --cached --name-only", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const shouldSkip = () => {
  if (process.env.SKIP_VERSION_BUMP === "1") {
    return true;
  }

  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    return true;
  }

  return stagedFiles.every((file) => VERSION_FILES.has(file));
};

const bumpPatchVersion = (version) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Unsupported version format: ${version}. Expected x.y.z format.`,
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  return `${major}.${minor}.${patch + 1}`;
};

const writeJson = (filePath, content) => {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
};

const main = () => {
  if (shouldSkip()) {
    process.stdout.write("[version-bump] skipped\n");
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const currentVersion = packageJson.version;
  if (typeof currentVersion !== "string") {
    throw new Error("package.json version field is missing or invalid.");
  }

  const nextVersion = bumpPatchVersion(currentVersion);
  packageJson.version = nextVersion;
  writeJson(packageJsonPath, packageJson);

  if (fs.existsSync(packageLockPath)) {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
    packageLock.version = nextVersion;

    if (
      packageLock.packages &&
      typeof packageLock.packages === "object" &&
      packageLock.packages[""] &&
      typeof packageLock.packages[""] === "object"
    ) {
      packageLock.packages[""].version = nextVersion;
    }

    writeJson(packageLockPath, packageLock);
  }

  process.stdout.write(
    `[version-bump] ${currentVersion} -> ${nextVersion}\n`,
  );
};

main();
