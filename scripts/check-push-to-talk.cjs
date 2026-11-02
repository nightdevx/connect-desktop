#!/usr/bin/env node
// Self-check for src/shared/push-to-talk-keys.ts.
//
// Push-to-talk fails in the two worst ways a microphone can: a binding that
// never matches leaves the user talking to nobody, and a release that is never
// seen leaves a hot mic open. Both are silent. The table is checked for codes
// that would collide in the keyboard hook, the parser for values a hand-edited
// preferences file can hold, and the tracker for the press orders real hands
// produce.
//
//   node scripts/check-push-to-talk.cjs

const assert = require("node:assert/strict");
const {
  PUSH_TO_TALK_SCAN_CODES,
  clearUnusedLegacyKey,
  createChordTracker,
  parsePushToTalkKeys,
} = require("../dist/shared/push-to-talk-keys.js");

// Two codes on one scan code would make one physical key press both.
const seen = new Map();
for (const [code, scanCode] of Object.entries(PUSH_TO_TALK_SCAN_CODES)) {
  assert.ok(Number.isInteger(scanCode) && scanCode > 0, `${code} has no scan code`);
  assert.ok(!seen.has(scanCode), `${code} and ${seen.get(scanCode)} share 0x${scanCode.toString(16)}`);
  seen.set(scanCode, code);
}

// The keys a 102-key Turkish board has must all be bindable.
for (const code of [
  "KeyA", "KeyZ", "Digit0", "Digit9", "F1", "F12", "F24", "Space", "Backquote",
  "IntlBackslash", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight",
  "AltLeft", "AltRight", "MetaLeft", "CapsLock", "Tab", "Numpad0", "NumpadEnter",
  "ArrowUp", "Insert", "Pause", "NumLock", "Mouse4", "Mouse5",
]) {
  assert.ok(code in PUSH_TO_TALK_SCAN_CODES, `${code} cannot be bound`);
}

// Spot values from the Windows set-1 table; a typo here binds the wrong key.
assert.equal(PUSH_TO_TALK_SCAN_CODES.KeyT, 0x14);
assert.equal(PUSH_TO_TALK_SCAN_CODES.Space, 0x39);
assert.equal(PUSH_TO_TALK_SCAN_CODES.ControlRight, 0xe01d);
assert.equal(PUSH_TO_TALK_SCAN_CODES.NumLock, 0xe045);
assert.equal(PUSH_TO_TALK_SCAN_CODES.Pause, 0x45);
assert.equal(PUSH_TO_TALK_SCAN_CODES.F24, 0x76);
// The side buttons: 0x10000 | XBUTTON1 / XBUTTON2, as native/keyboard-hook builds them.
assert.equal(PUSH_TO_TALK_SCAN_CODES.Mouse4, 0x10001);
assert.equal(PUSH_TO_TALK_SCAN_CODES.Mouse5, 0x10002);

// Parsing: what older versions stored keeps working.
assert.deepEqual(parsePushToTalkKeys("Space"), ["Space"]);
assert.deepEqual(parsePushToTalkKeys("KeyV"), ["KeyV"]);
assert.deepEqual(parsePushToTalkKeys("ControlLeft+KeyT"), ["ControlLeft", "KeyT"]);
assert.deepEqual(parsePushToTalkKeys(" ShiftLeft + F5 "), ["ShiftLeft", "F5"]);
assert.deepEqual(parsePushToTalkKeys("Mouse4"), ["Mouse4"]);
assert.deepEqual(parsePushToTalkKeys("ControlLeft+Mouse5"), ["ControlLeft", "Mouse5"]);
// Anything unknown, repeated, empty or too long is not a binding at all: half a
// combination would fire on keys the user never chose.
assert.deepEqual(parsePushToTalkKeys(""), []);
assert.deepEqual(parsePushToTalkKeys("Banana"), []);
assert.deepEqual(parsePushToTalkKeys("ControlLeft+Banana"), []);
assert.deepEqual(parsePushToTalkKeys("KeyT+KeyT"), []);
assert.deepEqual(parsePushToTalkKeys("KeyA+KeyB+KeyC+KeyD+KeyE"), []);
assert.deepEqual(parsePushToTalkKeys("constructor"), []);
assert.deepEqual(parsePushToTalkKeys(undefined), []);
assert.deepEqual(parsePushToTalkKeys(42), []);

// Tracker: active only while every key of the chord is held, in any order.
{
  const tracker = createChordTracker(["ControlLeft", "KeyT"]);
  assert.equal(tracker.update("KeyT", true), null, "half a chord must not talk");
  assert.equal(tracker.update("ControlLeft", true), true, "chord complete");
  assert.equal(tracker.update("ControlLeft", true), null, "key repeat changes nothing");
  assert.equal(tracker.update("KeyT", false), false, "any key up ends it");
  assert.equal(tracker.update("KeyT", true), true, "pressing again resumes");
  assert.equal(tracker.update("ShiftLeft", true), null, "keys outside the chord are ignored");
  assert.equal(tracker.reset(), true, "reset reports it was talking");
  assert.equal(tracker.reset(), false, "second reset is a no-op");
  assert.equal(tracker.update("KeyT", true), null, "reset forgot every held key");
}
{
  const tracker = createChordTracker(["Space"]);
  assert.equal(tracker.update("Space", true), true);
  assert.equal(tracker.update("Space", false), false);
  assert.equal(tracker.update("Space", false), null, "a stray key up is not a transition");
}
{
  const tracker = createChordTracker([]);
  assert.equal(tracker.update("Space", true), null, "an empty binding never talks");
}

// The old default Space is dropped only where push-to-talk was never on.
assert.equal(clearUnusedLegacyKey(false, "Space"), "");
assert.equal(clearUnusedLegacyKey(true, "Space"), "Space", "an active binding stays");
assert.equal(clearUnusedLegacyKey(false, "KeyV"), "KeyV", "a chosen key stays");

console.log("check-push-to-talk: ok");
