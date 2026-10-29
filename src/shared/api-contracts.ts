// The API types this app writes by hand, bound at compile time to the ones the
// backend generates from its Go structs.
//
// src/shared/generated is a verbatim copy of connect-backend's contracts/
// (`pnpm api-types:sync` copies it, scripts/check-api-types.cjs holds the copy
// to the original). Nothing in this file runs: a field the backend renames,
// drops or retypes fails `pnpm typecheck` on the line below that binds it,
// naming the field. The zod schemas that build request bodies are bound the
// same way in main/ipc/validators.ts.

import type { GameActivity } from "./game-activity";
import type * as Auth from "./generated/auth";
import type * as Chat from "./generated/chat";
import type * as Lobby from "./generated/lobby";
import type {
  AdminUpdateUserRequest,
  AdminUserDetail,
  AuthResponse,
  AuthTokens,
  ChangePasswordRequest,
  ChatAttachment,
  ChatMessage,
  ChatReaction,
  ChatReplyPreview,
  ForgotPasswordRequest,
  FriendEntry,
  ImageCropRect,
  LobbyDescriptor,
  LobbyStateMember,
  LoginRequest,
  PrivacySettings,
  RegisterRequest,
  ResetPasswordRequest,
  SendVerificationOTPRequest,
  UpdatePrivacyRequest,
  UpdateProfileRequest,
  UserActivity,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
  VerifyEmailRequest,
} from "./auth-contracts";
import type {
  ChatAttachmentUpload,
  DirectMessagesStreamEvent,
  LobbyRealtimeSnapshot,
  LobbyStreamEvent,
  UserDirectoryStreamEvent,
} from "./desktop-api-types";

// A type as tygo can state it: no null, and a union of literals widened to its
// primitive, all the way down.
type Loose<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? Loose<NonNullable<Item>>[]
        : T extends object
          ? { [K in keyof T]: Loose<NonNullable<T[K]>> }
          : T;

type Overlaps<A, B> = [Loose<NonNullable<A>>] extends [Loose<NonNullable<B>>]
  ? true
  : [Loose<NonNullable<B>>] extends [Loose<NonNullable<A>>]
    ? true
    : false;

/**
 * Each key the desktop declares, bar the ones it adds itself (Own), that the
 * server does not have or types as something the desktop's type cannot be;
 * never when there is none.
 *
 * Loose where tygo cannot say better. Null is not compared: a Go pointer comes
 * out optional whether it is omitted or sent as null. Literal unions are
 * compared as their primitive: a Go string enum comes out as string. And a key
 * passes when either side's type fits the other's, so an optional key on one
 * side is no mismatch. A nested object is held only as a whole that way, which
 * is why each one the desktop names is bound on a line of its own below.
 */
export type ContractDrift<Desktop, Server, Own extends keyof Desktop = never> = {
  [K in Exclude<keyof Desktop, Own>]-?: K extends keyof Server
    ? Overlaps<Desktop[K], Server[K]> extends true
      ? never
      : K
    : K;
}[Exclude<keyof Desktop, Own>];

/** Compiles only when there is no drift; the error names the keys. */
export type Bound<Drift extends never> = Drift;

type UsersFrame<Key extends string> = Extract<UserDirectoryStreamEvent, Record<Key, unknown>>;
type LobbyFrame<Type extends LobbyStreamEvent["type"]> = Extract<LobbyStreamEvent, { type: Type }>;
type DirectFrame<Type extends DirectMessagesStreamEvent["type"]> = Extract<
  DirectMessagesStreamEvent,
  { type: Type }
>;

// --- auth: the account, sign-in and the profile ------------------------------
type _UserProfile = Bound<ContractDrift<UserProfile, Auth.UserProfile>>;
type _AuthTokens = Bound<ContractDrift<AuthTokens, Auth.AuthTokens>>;
type _AuthResponse = Bound<ContractDrift<AuthResponse, Auth.AuthResponse>>;
type _UserSettingsProfile = Bound<ContractDrift<UserSettingsProfile, Auth.UserSettingsProfile>>;
type _PrivacySettings = Bound<ContractDrift<PrivacySettings, Auth.PrivacySettings>>;
type _UserDirectoryEntry = Bound<ContractDrift<UserDirectoryEntry, Auth.UserDirectoryEntry>>;
type _UserActivity = Bound<ContractDrift<UserActivity, Auth.UserActivity>>;
type _GameActivity = Bound<ContractDrift<GameActivity, Auth.UserActivity>>;
type _FriendEntry = Bound<ContractDrift<FriendEntry, Auth.FriendEvent>>;
type _AdminUserDetail = Bound<ContractDrift<AdminUserDetail, Auth.AdminUserDetail>>;

type _LoginRequest = Bound<ContractDrift<LoginRequest, Auth.LoginRequest>>;
type _RegisterRequest = Bound<ContractDrift<RegisterRequest, Auth.RegisterRequest>>;
type _ChangePasswordRequest = Bound<ContractDrift<ChangePasswordRequest, Auth.ChangePasswordRequest>>;
type _UpdateProfileRequest = Bound<ContractDrift<UpdateProfileRequest, Auth.UpdateProfileRequest>>;
type _ImageCropRect = Bound<ContractDrift<ImageCropRect, Auth.ImageCropRect>>;
type _UpdatePrivacyRequest = Bound<ContractDrift<UpdatePrivacyRequest, Auth.UpdatePrivacyRequest>>;
type _ForgotPasswordRequest = Bound<ContractDrift<ForgotPasswordRequest, Auth.ForgotPasswordRequest>>;
type _ResetPasswordRequest = Bound<ContractDrift<ResetPasswordRequest, Auth.ResetPasswordRequest>>;
type _SendVerificationOTPRequest = Bound<
  ContractDrift<SendVerificationOTPRequest, Auth.SendVerificationOTPRequest>
>;
type _VerifyEmailRequest = Bound<ContractDrift<VerifyEmailRequest, Auth.VerifyEmailRequest>>;
type _AdminUpdateUserRequest = Bound<ContractDrift<AdminUpdateUserRequest, Auth.AdminUpdateUserRequest>>;

// --- the users socket ---------------------------------------------------------
type _UsersFrameUser = Bound<ContractDrift<UsersFrame<"user">, Auth.UserDirectoryWSMessage>>;
type _UsersFramePresence = Bound<ContractDrift<UsersFrame<"presence">, Auth.UserDirectoryWSMessage>>;
type _UsersFrameActivity = Bound<ContractDrift<UsersFrame<"activity">, Auth.UserDirectoryWSMessage>>;
type _UsersFrameFriend = Bound<ContractDrift<UsersFrame<"friend">, Auth.UserDirectoryWSMessage>>;
type _UsersFrameCall = Bound<ContractDrift<UsersFrame<"callPayload">, Auth.UserDirectoryWSMessage>>;
type _ProfileUpdated = Bound<
  ContractDrift<Extract<UsersFrame<"user">, { type: "user-profile-updated" }>["user"], Auth.UserProfileUpdateEvent>
>;
type _ProfileDeleted = Bound<
  ContractDrift<Extract<UsersFrame<"user">, { type: "profile-deleted" }>["user"], Auth.UserProfileUpdateEvent>
>;
type _PresenceUpdated = Bound<ContractDrift<UsersFrame<"presence">["presence"], Auth.UserPresenceEvent>>;
type _ActivityUpdated = Bound<ContractDrift<UsersFrame<"activity">["activity"], Auth.UserActivityEvent>>;
type _FriendEvent = Bound<ContractDrift<UsersFrame<"friend">["friend"], Auth.FriendEvent>>;
type _CallSignal = Bound<ContractDrift<UsersFrame<"callPayload">["callPayload"], Auth.CallSignalPayload>>;

// --- chat, in a room and direct -----------------------------------------------
// localState is the desktop's own: a message shown before the server has it.
type _ChatMessage = Bound<ContractDrift<ChatMessage, Chat.Message, "localState">>;
type _ChatReplyPreview = Bound<ContractDrift<ChatReplyPreview, Chat.MessageReplyPreview>>;
type _ChatAttachment = Bound<ContractDrift<ChatAttachment, Chat.MessageAttachment>>;
type _ChatReaction = Bound<ContractDrift<ChatReaction, Chat.MessageReaction>>;
type _ChatAttachmentUpload = Bound<ContractDrift<ChatAttachmentUpload, Chat.AttachmentUpload>>;
type _LobbyMessage = Bound<ContractDrift<LobbyFrame<"lobby-message">, Chat.LobbyMessageFrame>>;
type _LobbyMessageDeleted = Bound<ContractDrift<LobbyFrame<"lobby-message-deleted">, Chat.LobbyMessageFrame>>;
type _DirectMessage = Bound<ContractDrift<DirectFrame<"direct-chat-message">, Chat.DirectMessageFrame>>;
type _DirectMessageDeleted = Bound<
  ContractDrift<DirectFrame<"direct-chat-message-deleted">, Chat.DirectMessageFrame>
>;
type _DirectTyping = Bound<ContractDrift<DirectFrame<"direct-chat-typing">, Chat.DirectMessageFrame>>;

// --- lobbies: the list, the rosters and the room events -------------------------
type _LobbyDescriptor = Bound<ContractDrift<LobbyDescriptor, Lobby.LobbySummary>>;
type _LobbyStateMember = Bound<ContractDrift<LobbyStateMember, Lobby.Member>>;
type _LobbyRealtimeSnapshot = Bound<ContractDrift<LobbyRealtimeSnapshot, Lobby.LobbyRealtimeSnapshot>>;
type _LobbiesSnapshot = Bound<ContractDrift<LobbyFrame<"lobbies-snapshot">, Lobby.LobbiesSnapshotFrame>>;
// type and at are the envelope removalFrame and emoteFrame put round the event.
type _LobbyRemoved = Bound<ContractDrift<LobbyFrame<"lobby-removed">, Lobby.RemovalEvent, "type" | "at">>;
type _LobbyEmote = Bound<ContractDrift<LobbyFrame<"lobby-emote">, Lobby.EmoteEvent, "type" | "at">>;
