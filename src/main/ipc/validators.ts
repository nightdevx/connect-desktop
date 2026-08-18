import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const registerSchema = z.object({
  email: z.string().email().max(128),
  username: z.string().min(3).max(64),
  // 72 bytes, matching bcrypt's hard limit. Anything longer used to pass here
  // and then fail server-side with an unexplained 500.
  password: z.string().min(8).max(72),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(128),
});

// Codes are 8 digits now. The 6..8 range keeps any code issued just before a
// deploy usable for the rest of its 10-minute window.
const otpCode = z.string().regex(/^\d{6,8}$/, "code must be 6-8 digits");

export const resetPasswordSchema = z.object({
  email: z.string().email().max(128),
  code: otpCode,
  newPassword: z.string().min(8).max(72),
});

export const sendVerificationOTPSchema = z.object({
  email: z.string().email().max(128),
});

export const verifyEmailSchema = z.object({
  email: z.string().email().max(128),
  code: otpCode,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  newPassword: z.string().min(8).max(72),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(3).max(32),
  email: z.string().max(128).nullable().optional(),
  bio: z.string().max(240).nullable().optional(),
  // 14,000,000 characters of base64 ≈ a 10 MB picture, matching the backend's
  // maxAvatarDataURLLength. Keep the two in step: a value that passes here and
  // fails there is a 400 the user cannot act on.
  //
  // bannerUrl is not optional decoration here. z.object STRIPS keys it does not
  // declare, so leaving it out silently deleted the banner from every profile
  // save — and the backend reads an absent banner as "clear it", which is
  // exactly what a stripped key looks like from the other side.
  avatarUrl: z.string().max(14_000_000).nullable().optional(),
  bannerUrl: z.string().max(14_000_000).nullable().optional(),
  // Fractions of the source, so every one of them is inside 0..1. The server
  // clamps as well; this is what stops a malformed rect reaching it at all.
  bannerCrop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(8).max(72),
});

// Attachments ride inline as base64. 7,000,000 characters ≈ the 5 MB the
// backend accepts after decoding.
const attachmentUploadSchema = z.object({
  name: z.string().min(1).max(120),
  mimeType: z.string().max(128).optional().default(""),
  dataBase64: z.string().min(1).max(7_000_000),
});

// A message may be body-only or attachment-only, so the body floor is 0 here
// and the "not both empty" rule is enforced by the backend.
const messageBody = z.string().max(1200);
const messageId = z.string().min(2).max(128);
const searchQuery = z.string().min(1).max(128);
// Emoji are frequently multi-codepoint (ZWJ, skin tone); bound the length
// rather than demanding one character.
const reactionEmoji = z.string().min(1).max(64);

export const messageEditSchema = z.object({
  messageId,
  body: z.string().min(1).max(1200),
});

export const messageReactionSchema = z.object({
  messageId,
  emoji: reactionEmoji,
  // true adds, false removes. Explicit rather than a toggle so a double-click
  // race cannot flip it back on.
  add: z.boolean(),
});

export const attachmentFetchSchema = z.object({
  attachmentId: messageId,
});

// A remote image URL out of a message body. The handler re-checks it against
// the GIF provider allowlist before fetching — this only bounds the length.
export const saveImageUrlSchema = z.object({
  url: z.string().url().max(2048),
});

export const saveAttachmentSchema = z.object({
  attachmentId: messageId,
  // Only a default for the save dialog; the real name was already sanitized
  // server-side at upload.
  fileName: z.string().min(1).max(120),
});

export const lobbySearchSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  query: searchQuery,
  limit: z.number().int().min(1).max(100).optional().default(40),
});

export const directSearchSchema = z.object({
  peerUserId: z.string().min(2).max(128),
  query: searchQuery,
  limit: z.number().int().min(1).max(100).optional().default(40),
});

export const createLobbySchema = z.object({
  name: z.string().min(2).max(64),
  isLocked: z.boolean().optional(),
  allowedUsers: z.array(z.string()).optional(),
  password: z.string().max(128).optional(),
  // Immutable after creation, so it has no counterpart in updateLobbySchema.
  isTextOnly: z.boolean().optional(),
});

export const updateLobbySchema = z.object({
  lobbyId: z.string().min(2).max(128),
  name: z.string().min(2).max(64),
  isLocked: z.boolean().optional(),
  allowedUsers: z.array(z.string()).optional(),
  // undefined = keep current, "" = clear, string = set new password.
  password: z.string().max(128).nullable().optional(),
});

export const deleteLobbySchema = z.object({
  lobbyId: z.string().min(2).max(128),
});

export const lobbyJoinSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  password: z.string().max(128).optional(),
});

export const lobbyModerateSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  userId: z.string().min(2).max(128),
});

// How long a restriction lasts. Omitted means indefinite — until a moderator
// lifts it — which is what every caller got before this existed. The ceiling
// matches maxRestrictionDuration on the server; a value past it is refused
// there rather than silently overflowing into a timestamp in the past.
const restrictionDurationSeconds = z
  .number()
  .int()
  .min(0)
  .max(365 * 24 * 60 * 60)
  .optional();

// A timeout keeps someone OUT of the lobby; a kick only removes them and lets
// them back after the cooldown. Two different decisions, two different routes.
export const lobbyTimeoutSchema = lobbyModerateSchema.extend({
  durationSeconds: restrictionDurationSeconds,
});

// Admin moderation and settings. Bounds mirror the server so a value that
// passes here and fails there is a 400 nobody can act on.
export const adminVoiceMuteSchema = z.object({
  userId: z.string().min(2).max(128),
  muted: z.boolean(),
  durationSeconds: restrictionDurationSeconds,
});

export const adminClearTimeoutSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  userId: z.string().min(2).max(128),
});

export const adminEmailVerifiedSchema = z.object({
  userId: z.string().min(2).max(128),
  verified: z.boolean(),
});

export const adminSettingsPatchSchema = z.object({
  registrationOpen: z.boolean().optional(),
  maxLobbies: z.number().int().min(1).max(1000).optional(),
  maxLobbiesPerUser: z.number().int().min(1).max(200).optional(),
  lobbyCapacity: z.number().int().min(2).max(100).optional(),
});

export const lobbyBansSchema = z.object({
  lobbyId: z.string().min(2).max(128),
});

export const lobbyModerateMuteSchema = lobbyModerateSchema.extend({
  muted: z.boolean().optional().default(true),
  durationSeconds: restrictionDurationSeconds,
});

export const lobbyStateSchema = z.object({
  lobbyId: z.string().min(2).max(128),
});

export const lobbyMessagesListSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  limit: z.number().int().min(1).max(200).optional().default(80),
});

export const lobbyMessageSendSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  body: messageBody,
  replyToId: messageId.optional(),
  attachment: attachmentUploadSchema.optional(),
});

export const lobbyMessageDeleteSchema = z.object({
  messageId: z.string().min(2).max(128),
});

export const lobbyLeaveSchema = z.object({
  lobbyId: z.string().min(2).max(128).optional(),
}).optional().default({});

export const lobbyMuteSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  muted: z.boolean(),
});

export const lobbyDeafenSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  deafened: z.boolean(),
});

export const lobbyEnabledSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  enabled: z.boolean(),
});

// The emote set is enforced by the backend, which is the only authority that
// matters; this bound just keeps an unbounded string out of the request body.
export const lobbyEmoteSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  // Long enough for "custom:<nanosecond-timestamp>-<counter>"; the server is
  // what decides whether the id resolves.
  emote: z.string().min(1).max(96),
});

// The upload. Every bound here is also enforced server-side — this only stops
// an obviously bad request from becoming a round trip.
export const emoteUploadSchema = z.object({
  name: z.string().min(1).max(24),
  // 400 KB of base64, matching maxEmoteDataURLLength in the backend.
  dataUrl: z
    .string()
    .min(16)
    .max(400_000)
    .regex(/^data:audio\/[a-z0-9.+-]+;base64,/i, "audio data URL required"),
});

export const emoteIdSchema = z.object({
  emoteId: z.string().min(1).max(96),
});

export const adminEmoteQuotaSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  quota: z.number().int().min(0).max(50).nullable(),
});

export const liveKitTokenSchema = z.object({
  room: z.string().min(2).max(128).optional(),
}).optional().default({});

export const setPresenceSchema = z.object({
  status: z.enum(["online", "idle", "dnd"]),
});

export const directTypingSchema = z.object({
  peerUserId: z.string().min(2).max(128),
});

export const directMessagesListSchema = z.object({
  peerUserId: z.string().min(2).max(128),
  limit: z.number().int().min(1).max(200).optional().default(80),
  // Message id cursor for the older-than page.
  before: z.string().min(2).max(128).optional(),
});

export const blockUserSchema = z.object({
  userId: z.string().min(2).max(128),
});

// Friend requests target a username, not an id; the backend pattern is
// ^[a-z0-9_.-]{3,32}$, so the length bound matches it rather than the id one.
export const friendRequestSendSchema = z.object({
  username: z.string().min(3).max(32),
});

// Every field optional: an omitted key means "leave unchanged", which is why
// this cannot be folded into updateProfileSchema's PUT semantics.
export const updatePrivacySchema = z.object({
  allowDirectMessagesFrom: z.enum(["everyone", "friends"]).optional(),
  allowCallsFrom: z.enum(["everyone", "friends"]).optional(),
  allowFriendRequests: z.boolean().optional(),
});

export const unreadCountsSchema = z.object({
  // Bounded: this becomes one query parameter per id.
  peerUserIds: z.array(z.string().min(2).max(128)).max(500),
});

export const markDirectReadSchema = z.object({
  peerUserId: z.string().min(2).max(128),
});

export const sendDirectMessageSchema = z.object({
  peerUserId: z.string().min(2).max(128),
  body: messageBody,
  replyToId: messageId.optional(),
  attachment: attachmentUploadSchema.optional(),
});

export const windowAttentionSchema = z.object({
  enabled: z.boolean(),
});

export const appPreferencesSchema = z.object({
  launchOnStartup: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  closeToTray: z.boolean().optional(),
  hardwareAcceleration: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  // Accelerators reach globalShortcut.register, so they are bounded here as
  // well as in the preference store's own sanitizer.
  hotkeyToggleMute: z.string().max(64).optional(),
  hotkeyToggleDeafen: z.string().max(64).optional(),
  pushToTalk: z.boolean().optional(),
  pushToTalkKey: z.string().max(24).optional(),
});

// The query is user input that ends up in a URL the main process builds, so it
// is bounded here at the trust boundary. Empty is legal and means "trending".
// 100 characters is far past any real GIF search and short enough that the
// request line stays sane.
export const gifSearchSchema = z.object({
  query: z.string().max(100).optional(),
}).optional().default({});

export const notifySchema = z.object({
  kind: z.enum(["direct-message", "incoming-call", "lobby-message"]),
  // Rendered straight into an OS toast, so keep it to a sane length.
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  peerUserId: z.string().min(2).max(128).optional(),
  lobbyId: z.string().min(1).max(128).optional(),
});

export const initiateCallSchema = z.object({
  targetUserId: z.string().min(2).max(128),
});

export const acceptCallSchema = z.object({
  callId: z.string().min(2).max(128),
  callerId: z.string().min(2).max(128),
});

export const rejectCallSchema = z.object({
  callId: z.string().min(2).max(128),
  callerId: z.string().min(2).max(128),
});

export const cancelCallSchema = z.object({
  callId: z.string().min(2).max(128),
  targetUserId: z.string().min(2).max(128),
});

export const adminUpdateUserSchema = z.object({
  userId: z.string().min(2).max(128),
  payload: z.object({
    displayName: z.string().min(3).max(32).optional(),
    email: z.string().max(128).nullable().optional(),
    bio: z.string().max(240).nullable().optional(),
    role: z.enum(["admin", "member"]).optional(),
  }),
});

export const adminResetPasswordSchema = z.object({
  userId: z.string().min(2).max(128),
  newPassword: z.string().min(8).max(256),
});

export const adminListLobbyEventsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  lobbyId: z.string().min(2).max(128).optional().or(z.literal("")),
  userId: z.string().min(2).max(128).optional().or(z.literal("")),
  eventType: z.string().max(128).optional().or(z.literal("")),
  search: z.string().max(256).optional().or(z.literal("")),
}).optional().default({});


// The two admin list endpoints used to take `params?: any` and hand it straight
// to the backend. The backend validates too, but "the other side checks it" is
// not a reason for this side to accept anything — these are the shapes the
// renderer actually sends, and a value outside them is a bug worth failing on
// here rather than a query string the backend has to guess at.
export const adminListUsersSchema = z
  .object({
    search: z.string().max(256).optional(),
    role: z.enum(["all", "admin", "member"]).optional(),
    status: z.enum(["all", "active", "banned", "unverified"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .optional()
  .default({});

export const adminListLobbiesSchema = z
  .object({
    search: z.string().max(256).optional(),
    locked: z.enum(["all", "locked", "open"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .optional()
  .default({});
