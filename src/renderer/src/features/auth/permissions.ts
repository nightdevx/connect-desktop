// Single source of truth for client-side authorization checks. These only
// gate UI visibility — the backend enforces the real rules — but keeping one
// definition avoids the drift that scattered `role === "admin" || id === ...`
// checks caused. Authorization depends on ROLE only, never id/username.

// Bootstrap admin account id (mirrors backend auth.SeedAdminID). Only used to
// hide the seed account from selectable lists, not for granting access.
export const SEED_ADMIN_ID = "admin-master-id";

export const isAdminRole = (role?: string | null): boolean => role === "admin";

// Owner (creator) or any admin may manage/moderate a lobby.
export const canManageLobby = (
  lobbyCreatedBy: string,
  userId: string,
  role?: string | null,
): boolean => lobbyCreatedBy === userId || isAdminRole(role);
