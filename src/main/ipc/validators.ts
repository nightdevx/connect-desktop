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
  // 7,000,000 characters of base64 ≈ a 5 MB picture, matching the backend's
  // maxAvatarDataURLLength. Keep the two in step: a value that passes here and
  // fails there is a 400 the user cannot act on.
  avatarUrl: z.string().max(7_000_000).nullable().optional(),
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

export const lobbyModerateMuteSchema = lobbyModerateSchema.extend({
  muted: z.boolean().optional().default(true),
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

export const notifySchema = z.object({
  kind: z.enum(["direct-message", "incoming-call"]),
  // Rendered straight into an OS toast, so keep it to a sane length.
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  peerUserId: z.string().min(2).max(128).optional(),
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

