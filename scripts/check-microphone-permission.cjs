#!/usr/bin/env node
// Self-check for resolveMicrophonePermission in
// src/renderer/src/features/livekit/services/stream/constants.ts.
//
// A moderator mute is enforced by dropping MICROPHONE from this client's publish
// grant, and the permission update is the only signal that says so at the moment
// it happens. Nothing used to listen for it, which is the whole of the reported
// bug: the mute was lifted, the grant came back, and nobody asked to publish
// again -- the user stayed silent with their own mic button showing open until
// they left the room and rejoined.
//
// Three rules, and each one has a way of being wrong that is invisible until a
// real moderator does it to a real person:
//
//   * the first permission of a session is a BASELINE, not an announcement (it
//     is the token's own grant landing at join),
//   * a republish is only ever the granting direction (asking for a microphone
//     we may not use fails through every capture attempt and surfaces as a
//     device warning, for a mute somebody applied on purpose),
//   * an empty source list means unrestricted, not "no microphone".
//
// Output goes under node_modules/.cache for the same reason the sibling checks
// do: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-microphone-permission.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-mic-permission-"));

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
          "src/renderer/src/features/livekit/services/stream/constants.ts",
        ),
        formats: ["es"],
        fileName: () => "constants.mjs",
      },
      rollupOptions: { external: ["electron", "livekit-client"] },
    },
  });

  const bundle = path.join(outDir, "constants.mjs");
  const { resolveMicrophonePermission, PROTO_TRACK_SOURCE_MICROPHONE } =
    await import(pathToFileURL(bundle).href);

  const CAMERA = 1;
  const SCREEN_SHARE = 3;
  const SCREEN_SHARE_AUDIO = 4;
  const WITH_MIC = [CAMERA, SCREEN_SHARE, SCREEN_SHARE_AUDIO, PROTO_TRACK_SOURCE_MICROPHONE];
  const WITHOUT_MIC = [CAMERA, SCREEN_SHARE, SCREEN_SHARE_AUDIO];

  assert.equal(
    PROTO_TRACK_SOURCE_MICROPHONE,
    2,
    "livekit.TrackSource.MICROPHONE is 2 on the wire",
  );

  // --- reading the grant -----------------------------------------------------
  assert.equal(
    resolveMicrophonePermission(WITH_MIC, null).allowed,
    true,
    "a grant listing MICROPHONE allows the microphone",
  );
  assert.equal(
    resolveMicrophonePermission(WITHOUT_MIC, null).allowed,
    false,
    "a grant without MICROPHONE is a moderator mute",
  );

  // An empty list is LiveKit for "no per-source restriction". Reading it as
  // "publishes nothing" would announce a mute to every room that has never had
  // one -- and then never republish, because the mute never lifts.
  assert.equal(resolveMicrophonePermission([], null).allowed, true);
  assert.equal(resolveMicrophonePermission(undefined, null).allowed, true);

  // --- the first permission of a session is a baseline -----------------------
  for (const sources of [WITH_MIC, WITHOUT_MIC, [], undefined]) {
    const first = resolveMicrophonePermission(sources, null);
    assert.equal(
      first.announce,
      false,
      "the token's own grant at join is not a moderator decision",
    );
    assert.equal(first.republish, false, "connect() already publishes the mic");
  }

  // --- a mute applied mid-session --------------------------------------------
  const muted = resolveMicrophonePermission(WITHOUT_MIC, true);
  assert.deepEqual(muted, { allowed: false, announce: true, republish: false });

  // --- and lifted ------------------------------------------------------------
  const lifted = resolveMicrophonePermission(WITH_MIC, false);
  assert.deepEqual(lifted, { allowed: true, announce: true, republish: true });

  // --- a restatement of the same grant is not a change -----------------------
  //
  // The server restates the grant on every participant_joined, so an equal
  // permission arrives routinely. Announcing it would toast the user for
  // nothing; republishing on it would tear down and rebuild a live microphone.
  const unchangedAllowed = resolveMicrophonePermission(WITH_MIC, true);
  assert.deepEqual(unchangedAllowed, {
    allowed: true,
    announce: false,
    republish: false,
  });

  const unchangedMuted = resolveMicrophonePermission(WITHOUT_MIC, false);
  assert.deepEqual(unchangedMuted, {
    allowed: false,
    announce: false,
    republish: false,
  });

  // --- the listener is actually registered -----------------------------------
  //
  // The rules above are worth nothing if nobody subscribes to the event, which
  // is exactly the state this fix found the code in.
  const roomEvents = fs.readFileSync(
    path.join(
      projectRoot,
      "src/renderer/src/features/livekit/services/stream/room-event-manager.ts",
    ),
    "utf8",
  );
  assert.ok(
    roomEvents.includes("RoomEvent.ParticipantPermissionsChanged"),
    "the permission event must be subscribed, or none of this ever runs",
  );
  assert.ok(
    roomEvents.includes("resolveMicrophonePermission"),
    "the handler must decide through the rules checked above",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "microphone-permission self-check passed (baseline ignored, republish on grant only)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
