#!/usr/bin/env node
// Self-check for src/shared/picture-urls.ts: avatars and banners by address.
//
// From core.DesktopPictureURLVersion on, the backend sends avatarVersion /
// bannerVersion where the base64 used to be. attachPictureUrls is what turns
// those into the addresses every <img> reads, and parsePictureUrl is the gate
// in front of the file names the main process caches them under. Wrong in
// either direction is silent: a blank avatar everywhere, or a base64 picture
// from an older backend overwritten with an address nobody can answer.
//
// Runs against dist/ (pnpm build:main first; pnpm check does).
//
//   node scripts/check-picture-urls.cjs

const assert = require("node:assert/strict");
const path = require("node:path");

const { attachPictureUrls, parsePictureUrl, pictureUrl, sniffImageType } = require(
  path.join(__dirname, "..", "dist", "shared", "picture-urls.js"),
);

const VERSION = "0123456789abcdef";
const ID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";

// --- a directory row and a profile event, as a newer backend sends them -----
const users = attachPictureUrls({
  users: [
    { userId: ID, username: "ayse", avatarVersion: VERSION },
    { userId: "u2", username: "mert" }, // no picture
    { userId: "u3", avatarUrl: "data:image/png;base64,AAAA", avatarVersion: VERSION }, // older shape kept
  ],
});
assert.equal(users.users[0].avatarUrl, pictureUrl("avatar", ID, VERSION));
assert.equal(users.users[1].avatarUrl, undefined, "a user with no picture got one");
assert.equal(users.users[2].avatarUrl, "data:image/png;base64,AAAA", "a base64 picture was replaced");

const event = attachPictureUrls({
  type: "user-profile-updated",
  user: { userId: ID, avatarUrl: null, bannerUrl: null, avatarVersion: VERSION, bannerVersion: "fedcba9876543210" },
});
assert.equal(event.user.avatarUrl, pictureUrl("avatar", ID, VERSION));
assert.equal(event.user.bannerUrl, pictureUrl("banner", ID, "fedcba9876543210"));

// A profile is keyed by id, not userId.
const me = attachPictureUrls({ user: { id: ID, bannerVersion: VERSION } });
assert.equal(me.user.bannerUrl, pictureUrl("banner", ID, VERSION));

// The settings profile has no id: nothing to name the picture by, left alone.
const settings = attachPictureUrls({ profile: { avatarUrl: null, avatarVersion: VERSION } });
assert.equal(settings.profile.avatarUrl, null);

// A malformed version or owner never becomes an address.
const odd = attachPictureUrls({ userId: "../../etc", avatarVersion: VERSION, bannerVersion: "nothex" });
assert.equal(odd.avatarUrl, undefined);
assert.equal(odd.bannerUrl, undefined);

// --- the main process's gate ------------------------------------------------
assert.deepEqual(parsePictureUrl(pictureUrl("avatar", ID, VERSION)), {
  kind: "avatar",
  userId: ID,
  version: VERSION,
});
for (const bad of [
  `connect-picture://avatar/${ID}`,
  `connect-picture://avatar/${ID}?v=short`,
  `connect-picture://other/${ID}?v=${VERSION}`,
  `connect-picture://avatar/..%2F..%2Fsession.json?v=${VERSION}`,
  `https://avatar/${ID}?v=${VERSION}`,
  "not a url",
]) {
  assert.equal(parsePictureUrl(bad), null, `${bad} was accepted`);
}

// --- the type the cache serves ------------------------------------------------
assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "image/png");
assert.equal(sniffImageType(new TextEncoder().encode("GIF89a")), "image/gif");
assert.equal(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
assert.equal(sniffImageType(Uint8Array.from([1, 2, 3])), "application/octet-stream");

console.log("picture-urls self-check passed (addresses from versions, base64 kept, gate, type sniffing)");
