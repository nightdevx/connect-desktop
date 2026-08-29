"use strict";

/**
 * The per-person playback preferences, and the round trip that forgets them.
 *
 * RemoteParticipantAudioPreference is written to localStorage and read back on
 * the next launch, and BOTH halves of that trip are hand-written field lists:
 *
 *   - readStoredParticipantAudio rebuilds the object key by key, deliberately,
 *     because it is parsing untrusted input.
 *   - isDefaultPreference decides whether a row is worth storing at all, by
 *     testing every field against its default.
 *
 * A field added to the type and missed in either one fails silently and in the
 * worst possible way: the preference works for the rest of the session and is
 * gone at the next launch, so it reads as "the setting does nothing sometimes".
 * That is exactly what happened to emoteMuted, which was in neither list —
 * silencing somebody's soundboard counted as no preference at all, so the row
 * was dropped on save.
 *
 * emoteMuted is checked once more on its own: it is the one field that never
 * reaches LiveKit, so nothing in the media path would notice if the playback
 * gate stopped consulting it.
 *
 *   node scripts/check-participant-audio.cjs
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

const typesSource = read(
  "src", "renderer", "src", "features", "livekit", "services", "stream", "types.ts",
);
const sessionSource = read(
  "src", "renderer", "src", "features", "livekit", "hooks", "use-livekit-session.ts",
);
const playbackSource = read(
  "src", "renderer", "src", "app", "workspace-shell", "use-lobby-emote-playback.ts",
);

const block = (source, header, where) => {
  const start = source.indexOf(header);
  assert.ok(start !== -1, `${where}: could not find ${header}`);
  const end = source.indexOf("\n}", start);
  assert.ok(end !== -1, `${where}: ${header} is not closed`);
  return source.slice(start, end);
};

// --- the field list -------------------------------------------------------
const interfaceBody = block(
  typesSource,
  "export interface RemoteParticipantAudioPreference {",
  "types.ts",
);

const fields = [
  ...interfaceBody.matchAll(/^\s{2}(\w+)\??:/gm),
].map((match) => match[1]);

assert.ok(
  fields.length >= 5,
  `expected the preference type to declare several fields, found ${fields.length}`,
);
assert.ok(
  fields.includes("emoteMuted"),
  "emoteMuted has left RemoteParticipantAudioPreference — this check is stale",
);

// --- both halves of the round trip ---------------------------------------
const restoreBody = block(
  sessionSource,
  "const readStoredParticipantAudio",
  "use-livekit-session.ts",
);
const defaultBody = block(
  sessionSource,
  "const isDefaultPreference",
  "use-livekit-session.ts",
);

const missingFromRestore = fields.filter(
  (field) => !restoreBody.includes(`${field}:`),
);
assert.deepEqual(
  missingFromRestore,
  [],
  `readStoredParticipantAudio does not rebuild: ${missingFromRestore.join(", ")} — ` +
    "these preferences are saved and then silently dropped at the next launch",
);

const missingFromDefault = fields.filter(
  (field) => !defaultBody.includes(`preference.${field}`),
);
assert.deepEqual(
  missingFromDefault,
  [],
  `isDefaultPreference does not test: ${missingFromDefault.join(", ")} — ` +
    "a row carrying only one of these counts as untouched and is never written",
);

// --- the one field with no media path behind it ---------------------------
// An emote is a lobby-stream event: the id crosses the wire, the sound does
// not. LiveKit's participant volume cannot reach it, so this gate is the only
// thing that silences one person's soundboard.
assert.match(
  playbackSource,
  /audioPreferencesRef\.current\[[^\]]+\]\?\.emoteMuted/,
  "the emote playback path no longer consults emoteMuted — a per-person " +
    "soundboard mute has nothing else enforcing it",
);

const gateIndex = playbackSource.search(/\?\.emoteMuted/);
const playIndex = playbackSource.search(/playEmote|playCustomEmote\(queryClient/);
assert.ok(
  gateIndex !== -1 && playIndex !== -1 && gateIndex < playIndex,
  "the emoteMuted gate has to come BEFORE the sound is played, or it silences nothing",
);

console.log(
  `participant-audio self-check passed (${fields.length} preferences, round trip complete, emote gate ahead of playback)`,
);
