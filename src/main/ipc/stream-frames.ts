// Which of the three streams a frame on the multiplexed socket belongs to.
//
// The server forwards each stream's frames unchanged and their types do not
// collide, so the type is the address. Pure and electron-free, so the
// self-check can hold it against the stream event types in desktop-api-types.

export type StreamKind = "lobby" | "users" | "dm";

const LOBBY_FRAMES = new Set([
  "lobbies-snapshot",
  "lobby-removed",
  "lobby-emote",
  "lobby-message",
  "lobby-message-deleted",
  "music-state",
  "watch-state",
  "minigame-table",
]);

const USER_FRAMES = new Set([
  "user-profile-updated",
  "user-presence-updated",
  "user-activity-updated",
  "profile-deleted",
  "friend-request",
  "friend-accepted",
  "friend-removed",
  "incoming-call",
  "call-accepted",
  "call-rejected",
  "call-cancelled",
]);

export const streamOfFrame = (type: string): StreamKind | null => {
  if (type.startsWith("direct-chat-")) {
    return "dm";
  }
  if (LOBBY_FRAMES.has(type)) {
    return "lobby";
  }
  if (USER_FRAMES.has(type)) {
    return "users";
  }
  return null;
};
