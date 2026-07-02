import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const registerSchema = z.object({
  email: z.string().email().max(128),
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(128),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(128),
  code: z.string().length(6),
  newPassword: z.string().min(8).max(256),
});

export const sendVerificationOTPSchema = z.object({
  email: z.string().email().max(128),
});

export const verifyEmailSchema = z.object({
  email: z.string().email().max(128),
  code: z.string().length(6),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(8).max(256),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(3).max(32),
  email: z.string().max(128).nullable().optional(),
  bio: z.string().max(240).nullable().optional(),
  avatarUrl: z.string().max(700000).nullable().optional(),
});

export const createLobbySchema = z.object({
  name: z.string().min(2).max(64),
  isLocked: z.boolean().optional(),
  allowedUsers: z.array(z.string()).optional(),
  password: z.string().max(128).optional(),
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

export const lobbyStateSchema = z.object({
  lobbyId: z.string().min(2).max(128),
});

export const lobbyMessagesListSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  limit: z.number().int().min(1).max(200).optional().default(80),
});

export const lobbyMessageSendSchema = z.object({
  lobbyId: z.string().min(2).max(128),
  body: z.string().min(1).max(1200),
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

export const directMessagesListSchema = z.object({
  peerUserId: z.string().min(2).max(128),
  limit: z.number().int().min(1).max(200).optional().default(80),
});

export const sendDirectMessageSchema = z.object({
  peerUserId: z.string().min(2).max(128),
  body: z.string().min(1).max(1200),
});

export const directMessagesStreamStartSchema = z.object({
  peerUserId: z.string().min(2).max(128),
});

export const directMessagesStreamStopSchema = z.object({
  peerUserId: z.string().min(2).max(128).nullable().optional(),
}).optional().default({});

export const windowAttentionSchema = z.object({
  enabled: z.boolean(),
});

export const appPreferencesSchema = z.object({
  launchOnStartup: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  closeToTray: z.boolean().optional(),
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

