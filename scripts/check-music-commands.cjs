"use strict";

/**
 * The music-bot contract, enforced across the two repos.
 *
 * Three things drift silently and each one is invisible until somebody is
 * sitting in a room wondering why nothing happens:
 *
 *   1. THE BOT IDENTITY PREFIX. The desktop builds "bot:music:<lobbyId>" to aim
 *      its volume slider at the bot's audio track; the backend builds the same
 *      string to name the participant AND to tell the reconciler that this
 *      participant is not a person. Change one side and the slider moves the
 *      volume of nobody.
 *
 *   2. THE COMMAND PREFIX and the commands the UI's buttons send. The transport
 *      buttons are shorthand for typed commands — "!skip", "!pause" — so a
 *      renamed command turns a button into a 400 nobody sees the reason for.
 *
 *   3. THE RECONCILER AND WEBHOOK GUARDS. Without music.IsBotIdentity in both,
 *      the bot is an unrostered participant: admit() looks it up as a user,
 *      fails, and evicts it — every four seconds, forever. The failure looks
 *      like "music cuts out after a moment", which is a long way from its cause.
 *
 *   node scripts/check-music-commands.cjs
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), "utf8");

const sharedSource = read("src", "shared", "music.ts");
const panelSource = read(
  "src",
  "renderer",
  "src",
  "features",
  "music",
  "music-panel.tsx",
);

const literal = (source, name) => {
  const match = source.match(
    new RegExp(`export const ${name}\\s*=\\s*"([^"]*)"`),
  );
  assert.ok(match, `${name} is not declared as a string literal in shared/music.ts`);
  return match[1];
};

const sharedPrefix = literal(sharedSource, "MUSIC_COMMAND_PREFIX");
const sharedBotPrefix = literal(sharedSource, "MUSIC_BOT_IDENTITY_PREFIX");

// Every command string the panel actually sends, including the ones built with
// a template (`!remove ${n}`).
const sentCommands = new Set();
for (const match of panelSource.matchAll(/runCommand\(\s*[`"']([^`"'\s]+)/g)) {
  sentCommands.add(match[1].replace(/^[!/]/, ""));
}
for (const match of panelSource.matchAll(
  /runCommand\([^)]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g,
)) {
  sentCommands.add(match[1].replace(/^[!/]/, ""));
  sentCommands.add(match[2].replace(/^[!/]/, ""));
}

assert.ok(
  sentCommands.size >= 4,
  `expected the panel to send several commands, found ${[...sentCommands].join(", ") || "none"}`,
);

// The backend is a SIBLING CHECKOUT, not part of this repository: present on a
// developer's machine, absent in this repo's CI. Skip loudly rather than fail.
const backendRoot = path.join(projectRoot, "..", "backend-go");
const backendFile = (...parts) => path.join(backendRoot, ...parts);
const backendPresent = fs.existsSync(
  backendFile("internal", "music", "commands.go"),
);

if (!backendPresent) {
  console.log(
    "check-music-commands: backend-go is not checked out beside this repo — " +
      "the cross-repo command, prefix and guard checks were SKIPPED",
  );
} else {
  const commandsGo = fs.readFileSync(
    backendFile("internal", "music", "commands.go"),
    "utf8",
  );
  const modelsGo = fs.readFileSync(
    backendFile("internal", "music", "models.go"),
    "utf8",
  );

  const goPrefix = commandsGo.match(/const CommandPrefix = "([^"]*)"/);
  assert.ok(goPrefix, "music.CommandPrefix not found in commands.go");
  assert.equal(
    sharedPrefix,
    goPrefix[1],
    `MUSIC_COMMAND_PREFIX (${sharedPrefix}) disagrees with music.CommandPrefix (${goPrefix[1]})`,
  );

  const goBotPrefix = modelsGo.match(/const BotIdentityPrefix = "([^"]*)"/);
  assert.ok(goBotPrefix, "music.BotIdentityPrefix not found in models.go");
  assert.equal(
    sharedBotPrefix,
    goBotPrefix[1],
    `MUSIC_BOT_IDENTITY_PREFIX (${sharedBotPrefix}) disagrees with music.BotIdentityPrefix (${goBotPrefix[1]})`,
  );

  const declared = new Set();
  for (const match of commandsGo.matchAll(/\{Name:\s*"([a-z]+)"/g)) {
    declared.add(match[1]);
  }
  assert.ok(
    declared.size > 5,
    `expected the Go command catalogue, found ${declared.size} entries`,
  );

  const unknown = [...sentCommands].filter((name) => !declared.has(name));
  assert.deepEqual(
    unknown,
    [],
    `the music panel sends commands the backend does not declare: ${unknown.join(", ")}`,
  );

  // The two guards that keep the bot from being evicted as a ghost user.
  const reconciler = fs.readFileSync(
    backendFile("internal", "media", "livekit", "reconciler.go"),
    "utf8",
  );
  const mediaHandler = fs.readFileSync(
    backendFile("internal", "media", "livekit", "handler.go"),
    "utf8",
  );

  assert.match(
    reconciler,
    /music\.IsBotIdentity\(/,
    "the reconciler no longer skips the music bot: it will be admitted as a user, fail the lookup and be evicted every tick",
  );
  assert.match(
    mediaHandler,
    /music\.IsBotIdentity\(/,
    "the LiveKit webhook path no longer skips the music bot: participant_joined will try to put it on the roster",
  );
}

console.log(
  `music-commands self-check passed (${sentCommands.size} panel commands${
    backendPresent ? ", cross-repo contract verified" : ", cross-repo checks skipped"
  })`,
);
