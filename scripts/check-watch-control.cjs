"use strict";

/**
 * Who may drive a shared video, enforced across the two repos.
 *
 * The rule is written down twice and it has to be, which is why this exists.
 *
 * The server is the authority: watch.Manager.CanControlSession answers "may this
 * account pause, seek or stop what is playing", and CanStart answers "may it
 * open a video, or replace the one already running". Both are re-derived on
 * every write, so a client cannot talk its way past them.
 *
 * But the wire deliberately does NOT carry those answers. It carries the
 * MODERATOR half only — watch/handler.go writeState sends
 * `Manager.CanControl(actor)` — because a client caches that value and then
 * applies it to every state frame arriving on the lobby socket afterwards.
 * "Is a moderator" is stable and survives that; "may drive what is playing right
 * now" stops being true the instant somebody else starts a video, and the socket
 * carries no fresh answer with it. So the client adds the other half itself,
 * from state.video.startedBy, which every frame carries.
 *
 * That leaves the same rule expressed in Go and in TypeScript. When they
 * disagree the failure is silent and unpleasant in both directions: controls
 * that are visible and enabled and answer every press with a 403, or controls
 * hidden from the very person the server would have obeyed — which is exactly
 * how this feature shipped for people who were not DJs.
 *
 * So: the TypeScript expressions are lifted out of the hook and actually
 * evaluated against the truth table below, and the Go side is checked to still
 * be built from the same three terms.
 *
 *   node scripts/check-watch-control.cjs
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const hookSource = fs.readFileSync(
  path.join(projectRoot, "src", "renderer", "src", "features", "watch", "use-watch-room.ts"),
  "utf8",
);

/**
 * Lifts one expression out of the hook, so the check runs the real thing.
 *
 * The scope argument matters. "canControl:" appears twice in that file, and the
 * other one is inside the socket handler, where the moderator flag is carried
 * forward across a broadcast — reading THAT one produced a check that passed
 * while testing nothing. The returned object is the only place the effective
 * answer is assembled.
 */
function expression(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `check-watch-control: ${label} is not written the way this check reads it`);
  return match[1].trim();
}

const returnIndex = hookSource.indexOf("return useMemo(");
assert.notEqual(
  returnIndex,
  -1,
  "check-watch-control: the hook no longer returns a useMemo'd object",
);
const returned = hookSource.slice(returnIndex);

const isStarterExpr = expression(
  hookSource,
  /const isStarter = Boolean\(\s*([\s\S]*?),?\s*\);/,
  "the isStarter derivation",
);
const canControlExpr = expression(
  returned,
  /canControl:\s*([^,\n]+),/,
  "the canControl derivation",
);
const canStartExpr = expression(returned, /canStart:\s*([^,\n]+),/, "the canStart derivation");

// Built from the source above rather than restated here: a copy in this file
// would pass forever while the hook drifted out from under it.
const derive = new Function(
  "roleCanControl",
  "state",
  "currentUserId",
  `const isStarter = Boolean(${isStarterExpr});
   return { canControl: ${canControlExpr}, canStart: ${canStartExpr} };`,
);

const ME = "u1";
const SOMEBODY_ELSE = "u2";

const idle = { active: false, video: null };
const mine = { active: true, video: { startedBy: ME } };
const theirs = { active: true, video: { startedBy: SOMEBODY_ELSE } };

/**
 * Every case, and what the server would answer for it.
 *
 * Read the last two columns as the server's own words:
 *   canControl = CanControl(actor) || video.StartedBy == actor
 *   canStart   = CanControl(actor) || no session || video.StartedBy == actor
 */
const cases = [
  // Nothing playing. Anyone in the room may open something; there is nothing to drive.
  { moderator: false, state: idle, canControl: false, canStart: true },
  { moderator: true, state: idle, canControl: true, canStart: true },

  // My own video: I drive it, and I may replace it with another.
  { moderator: false, state: mine, canControl: true, canStart: true },
  { moderator: true, state: mine, canControl: true, canStart: true },

  // Somebody else's: I watch it, and I cannot swap the film out mid-scene.
  { moderator: false, state: theirs, canControl: false, canStart: false },
  // ...unless I am a moderator, which is the whole point of the override.
  { moderator: true, state: theirs, canControl: true, canStart: true },
];

for (const expected of cases) {
  const got = derive(expected.moderator, expected.state, ME);
  const label =
    `moderator=${expected.moderator} ` +
    `session=${expected.state.active ? (expected.state.video.startedBy === ME ? "mine" : "theirs") : "none"}`;

  assert.equal(
    got.canControl,
    expected.canControl,
    `check-watch-control: canControl for ${label} is ${got.canControl}, want ${expected.canControl}`,
  );
  assert.equal(
    got.canStart,
    expected.canStart,
    `check-watch-control: canStart for ${label} is ${got.canStart}, want ${expected.canStart}`,
  );
}

// A viewer whose account id is not known yet must never be mistaken for the
// starter — startedBy is a non-empty string, and undefined === undefined would
// otherwise hand the controls to everybody in the room at once.
const anonymous = derive(false, mine, undefined);
assert.equal(
  anonymous.canControl,
  false,
  "check-watch-control: a viewer with no known account id was treated as the starter",
);

// ---------------------------------------------------------------- the Go half

const backendRoot = path.join(projectRoot, "..", "backend-go");
const managerPath = path.join(backendRoot, "internal", "watch", "manager.go");
const handlerPath = path.join(backendRoot, "internal", "watch", "handler.go");

if (!fs.existsSync(managerPath)) {
  console.log(
    "check-watch-control: backend-go is not checked out beside this repo — " +
      "the client half passed, the cross-repo half was skipped",
  );
  process.exit(0);
}

const managerSource = fs.readFileSync(managerPath, "utf8");
const handlerSource = fs.readFileSync(handlerPath, "utf8");

function goFunc(name) {
  const start = managerSource.indexOf(`func (m *Manager) ${name}(`);
  assert.notEqual(start, -1, `check-watch-control: watch.Manager.${name} is gone`);
  const end = managerSource.indexOf("\nfunc ", start + 1);
  return managerSource.slice(start, end === -1 ? undefined : end);
}

// The rule itself lives in one place, and both public predicates defer to it.
const mayDrive = goFunc("mayDriveLocked");
assert.match(
  mayDrive,
  /if moderator \|\| active\.video\.StartedBy == actor\.UserID \{\s*return true/,
  "check-watch-control: mayDriveLocked no longer answers 'moderator, or whoever started it'",
);

const canControlSession = goFunc("CanControlSession");
assert.match(
  canControlSession,
  /if m\.CanControl\(actor\) \{\s*return true/,
  "check-watch-control: CanControlSession no longer honours the moderator override",
);
assert.match(
  canControlSession,
  /return exists && m\.mayDriveLocked\(/,
  "check-watch-control: CanControlSession no longer defers to mayDriveLocked",
);

const canStart = goFunc("CanStart");
assert.match(
  canStart,
  /return !exists \|\| m\.mayDriveLocked\(/,
  "check-watch-control: CanStart no longer matches the client's canStart",
);

// Every write re-derives the rule against the session it is about to change,
// under the lock that protects it. Checking before the lock is not the same
// question a moment later: a moderator replacing the video hands the session to
// somebody else, and a stale answer would let the previous starter stop it.
for (const name of ["transition", "Stop", "Start"]) {
  assert.match(
    goFunc(name),
    /m\.mayDriveLocked\(lobbyID, active, actor, moderator\)/,
    `check-watch-control: watch.Manager.${name} is not re-deriving the rule under the lock`,
  );
}

// Opening a video must stay membership-gated, or it needs the moderator
// permission again and the person the feature is named after can never use it.
const start = goFunc("Start");
assert.match(
  start,
  /m\.requireMember\(lobbyID, actor\)|!m\.CanSee\(lobbyID, actor\)/,
  "check-watch-control: Start no longer gates on membership",
);
assert.match(
  start,
  /WATCH_BUSY/,
  "check-watch-control: Start lost the guard that stops one member replacing another's video",
);

// An idle room must answer with a revision that is not behind what it already
// broadcast, or the client's own out-of-order guard discards the reconnect
// resync and a stopped video stays on that viewer's stage.
assert.match(
  goFunc("currentLocked"),
  /state\.Revision = m\.revisions\[lobbyID\]/,
  "check-watch-control: an idle state is no longer stamped with the room's revision",
);

// The wire must keep carrying the STABLE half. Sending the session-aware answer
// here would go stale on the client the moment somebody else started a video.
assert.match(
  handlerSource,
  /"canControl":\s*h\.manager\.CanControl\(actor\)/,
  "check-watch-control: writeState no longer sends the moderator half — the client caches this value",
);

console.log(
  `watch-control self-check passed (${cases.length} permission cases, client and server agree)`,
);
