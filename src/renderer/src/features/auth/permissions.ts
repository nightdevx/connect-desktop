// Single source of truth for client-side authorization checks. These only
// gate UI visibility — the backend enforces the real rules — but keeping one
// definition avoids the drift that scattered role checks caused.

import { rankAtLeast } from "@shared/auth-contracts";

// Bootstrap admin account id (mirrors backend auth.SeedAdminID). Only used to
// hide the seed account from selectable lists, not for granting access.
export const SEED_ADMIN_ID = "admin-master-id";

export const isAdminRole = (role?: string | null): boolean =>
  rankAtLeast(role ?? "", "admin");

export const isModeratorRole = (role?: string | null): boolean =>
  rankAtLeast(role ?? "", "moderator");

export const canManageLobby = (
  lobbyCreatedBy: string,
  userId: string,
  role?: string | null,
): boolean => lobbyCreatedBy === userId || isModeratorRole(role);
