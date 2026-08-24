export type UserRole = "admin" | "member";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  /**
   * The profile card's cover image.
   *
   * Only ever present on a single-user payload — this profile, or the signed-in
   * user's own session. Deliberately absent from UserDirectoryEntry and from
   * every roster: a cover image is far larger than a 40px face, and the avatar
   * column already taught that lesson.
   */
  bannerUrl?: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Who may reach a user. The recipient's setting is what counts, checked one
// way: a friends-only user may still message a stranger, not the reverse.
export type PrivacyAudience = "everyone" | "friends";

export interface PrivacySettings {
  allowDirectMessagesFrom: PrivacyAudience;
  allowCallsFrom: PrivacyAudience;
  allowFriendRequests: boolean;
}

// Every field optional: omitted means "leave unchanged". This is why privacy
// has its own PATCH /auth/privacy instead of riding /auth/profile, whose nil
// fields CLEAR the column.
export interface UpdatePrivacyRequest {
  allowDirectMessagesFrom?: PrivacyAudience;
  allowCallsFrom?: PrivacyAudience;
  allowFriendRequests?: boolean;
}

// A named user id. The directory only lists friends and self, so anything that
// must render a name for someone outside that set — a pending request, a block,
// an exact-username lookup — carries the name in its own payload. No avatar: it
// rides the users-WS on every friend event and avatars are data URLs.
export interface FriendEntry {
  userId: string;
  username: string;
  displayName: string;
}

export interface FriendRequestLists {
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export interface UserSettingsProfile {
  displayName: string;
  email: string | null;
  emailVerified?: boolean;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  updatedAt: string;
  // Read-only here; writes go to PATCH /auth/privacy. Optional so a client
  // talking to a backend without the field still parses.
  privacy?: PrivacySettings;
}

// The region of the cover picture that gets kept, as fractions of the source.
//
// Fractions rather than pixels: the picture is re-encoded on the way in, so a
// pixel rectangle would mean a different thing on each side of the wire.
export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UpdateProfileRequest {
  displayName: string;
  email?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  // Only ever sent with an ANIMATED cover. Anything a canvas can re-encode is
  // cropped before it leaves, so a rect here as well would crop it twice.
  bannerCrop?: ImageCropRect;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface SendVerificationOTPRequest {
  email: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

// What the user is telling other people, as opposed to appOnline, which is
// merely whether a socket exists. "offline" is derived, never chosen.
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";
// Every status a user may pick for themselves, which is now all of them:
// "offline" is the invisible option. It used to be derived from connection
// state alone, so being present without announcing it was not expressible. The
// alias stays because the distinction is still worth naming at call sites — the
// server decides what OTHER people see, and it reports someone who picked this
// as offline in both halves of the pair (see Service.visiblePresence).
export type SelectablePresenceStatus = PresenceStatus;

export interface UserDirectoryEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
  appOnline?: boolean;
  presence?: PresenceStatus;
}

export interface LobbyDescriptor {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  createdByUsername?: string;
  memberCount: number;
  isLocked?: boolean;
  allowedUsers?: string;
  hasPassword?: boolean;
  // Chat-only room: no LiveKit token, no voice reconciler. Fixed at creation.
  isTextOnly?: boolean;
  // The room's member ceiling. Optional: an older server omits it.
  capacity?: number;
}

// Server-reported lobby membership. Deliberately has no `speaking` flag: the
// backend cannot know it (LiveKit does not report speaking state), so the field
// was always false on the wire. Speaking is derived client-side from LiveKit's
// ActiveSpeakersChanged — see LobbyParticipantView.
//
// Lives here rather than in desktop-api-types because the admin contracts below
// need it, and that file already imports this one.
export interface LobbyStateMember {
  userId: string;
  username: string;
  joinedAt: string;
  muted: boolean;
  serverMuted: boolean;
  deafened: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

// The quoted message shown above a reply. Denormalised by the server so a
// reply still renders after the original scrolls out of the loaded page.
// The operator knobs the admin panel turns. All of them used to be a
// compile-time constant or an environment variable, so changing one was a
// redeploy that dropped everybody in a voice room.
export interface AdminRuntimeSettings {
  registrationOpen: boolean;
  maxLobbies: number;
  maxLobbiesPerUser: number;
  lobbyCapacity: number;
  disabledMinigames: string[];
}

// Every field optional: omitted means "leave unchanged", so the panel can send
// one switch at a time.
export interface AdminRuntimeSettingsPatch {
  registrationOpen?: boolean;
  maxLobbies?: number;
  maxLobbiesPerUser?: number;
  lobbyCapacity?: number;
  disabledMinigames?: string[];
}

// A voice mute as the admin panel sees it: the username resolved, because the
// restriction is stored by id and nobody moderates a list of UUIDs.
export interface AdminVoiceMute {
  userId: string;
  username: string;
  mutedBy: string;
  mutedAt: string;
  expiresAt?: string | null;
}

// The same for timeouts, across every lobby at once rather than one room's view.
export interface AdminLobbyTimeout {
  lobbyId: string;
  lobbyName: string;
  userId: string;
  username: string;
  bannedBy: string;
  bannedAt: string;
  expiresAt?: string | null;
}

// A moderator timeout: this person may not enter this lobby.
//
// expiresAt absent means it stands until somebody lifts it from the admin panel,
// which is the same convention the server stores (a NULL expiry column).
export interface LobbyTimeout {
  lobbyId: string;
  userId: string;
  bannedBy: string;
  bannedAt: string;
  expiresAt?: string | null;
}

export interface ChatReplyPreview {
  id: string;
  userId?: string;
  username?: string;
  body?: string;
  // True when the quoted message has since been deleted.
  deleted?: boolean;
}

// Metadata only. Bytes come from getChatAttachment, which returns a data URL.
export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
}

// userIds rather than a "mine" flag: the same payload is broadcast to every
// client, so the viewer-relative answer has to be derived on the client.
export interface ChatReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  // Set once the author has edited it; rendered as a "(düzenlendi)" marker.
  editedAt?: string;
  replyTo?: ChatReplyPreview | null;
  attachment?: ChatAttachment | null;
  reactions?: ChatReaction[];
  // Marks a re-publish of an existing message (edit or reaction) so the client
  // replaces by id instead of appending.
  updated?: boolean;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  bio: string | null;
  avatarUrl: string | null;
  role: UserRole;
  bannedAt: string | null;
  // Non-null while the account is inside its self-service deletion window.
  deletionScheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUpdateUserRequest {
  displayName?: string;
  email?: string | null;
  bio?: string | null;
  role?: UserRole;
}

export interface AdminLobbySnapshot {
  lobby: LobbyDescriptor;
  members: LobbyStateMember[];
  size: number;
  revision: number;
  // The allow-list resolved to usernames, in the same order as the
  // lobby.allowedUsers CSV. Admin-only, so it lives here and not on the
  // descriptor that every authenticated user gets from GET /lobby/rooms.
  allowedUsernames?: string[];
  // The ids behind those usernames, same order — sent alongside them, so the
  // panel does not have to re-split the CSV to know which id a name is.
  allowedUserIds?: string[];
}

export interface AdminLobbyEvent {
  id: number;
  // Open set — the server keeps adding verbs. Known today: create, edit,
  // delete, join, join-admin, ban, timeout-leave, kicked, banned,
  // lobby-deleted, media-timeout, heartbeat-timeout, moved,
  // moved-by-moderator, self.
  eventType: string;
  lobbyId: string;
  lobbyName: string;
  userId: string;
  username: string;
  occurredAt: string;
}

export interface AdminStats {
  totalUsers: number;
  // Counted server-side, where the user table already is. The dashboard used to
  // fetch every user (avatars included) every 10 seconds to count these itself.
  adminUsers?: number;
  memberUsers?: number;
  verifiedUsers?: number;
  bannedUsers?: number;
  onlineUsers: number;
  totalLobbies: number;
  activeMembers: number;
  todayEvents: number;
  dbStatus?: string;
  liveKitStatus?: string;
  apiUrl?: string;
  envMode?: string;
  liveKitUrl?: string;
  activityTrend?: number[];
}
