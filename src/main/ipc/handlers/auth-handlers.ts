import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import {
  backendClient,
  directMessagesStreamManager,
  lobbyStreamManager,
  userDirectoryStreamManager,
  getSessionStore,
  ok,
  fail,
  getSessionSnapshot,
  persistAuthResult,
  ensureFreshSession,
  endSession,
  withAccessToken,
} from "../context";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendVerificationOTPSchema,
  verifyEmailSchema,
  adminUpdateUserSchema,
  adminResetPasswordSchema,
  adminListLobbyEventsSchema,
  adminListUsersSchema,
  adminListLobbiesSchema,
  blockUserSchema,
  setPresenceSchema,
  deleteAccountSchema,
  friendRequestSendSchema,
  updatePrivacySchema,
  emoteIdSchema,
  adminEmoteQuotaSchema,
  adminVoiceMuteSchema,
  adminClearTimeoutSchema,
  adminEmailVerifiedSchema,
  adminSettingsPatchSchema,
} from "../validators";
import { DesktopApiError } from "../../backend-client";

export function registerAuthHandlers(): void {
  ipcMain.handle("desktop:auth-register", async (_event, payload: unknown) => {
    try {
      const parsed = registerSchema.parse(payload);
      const result = await backendClient.auth.register(parsed);
      persistAuthResult(result);
      return ok(getSessionSnapshot());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-change-password", async (_event, payload: unknown) => {
    try {
      const parsed = changePasswordSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.changePassword(accessToken, parsed);
      });

      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-login", async (_event, payload: unknown) => {
    try {
      const parsed = loginSchema.parse(payload);
      const result = await backendClient.auth.login(parsed);
      persistAuthResult(result);
      return ok(getSessionSnapshot());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-forgot-password", async (_event, payload: unknown) => {
    try {
      const parsed = forgotPasswordSchema.parse(payload);
      const result = await backendClient.auth.forgotPassword(parsed);
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-reset-password", async (_event, payload: unknown) => {
    try {
      const parsed = resetPasswordSchema.parse(payload);
      const result = await backendClient.auth.resetPassword(parsed);
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-send-verification-otp", async (_event, payload: unknown) => {
    try {
      const parsed = sendVerificationOTPSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.sendVerificationOTP(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-verify-email", async (_event, payload: unknown) => {
    try {
      const parsed = verifyEmailSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.verifyEmail(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-logout", async () => {
    directMessagesStreamManager.stopAll();
    lobbyStreamManager.stopAll();
    userDirectoryStreamManager.stopAll();

    // Revoke server-side first, but never let that failure block the local
    // sign-out: a user logging out on a flaky network still expects the app to
    // forget them.
    const current = getSessionStore().get();
    if (current?.refreshToken) {
      try {
        await backendClient.auth.logout(current.refreshToken);
      } catch (error) {
        console.warn("[auth] server-side logout failed", error);
      }
    }

    getSessionStore().clear();
    return ok(getSessionSnapshot());
  });

  ipcMain.handle("desktop:auth-delete-account", async (_event, payload: unknown) => {
    try {
      const parsed = deleteAccountSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.deleteAccount(accessToken, parsed.password);
      });

      // The server has already revoked every session; drop the local one too so
      // the app does not sit there retrying with a token that will never work.
      directMessagesStreamManager.stopAll();
      lobbyStreamManager.stopAll();
      userDirectoryStreamManager.stopAll();
      getSessionStore().clear();

      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-export-data", async (event) => {
    try {
      const data = await withAccessToken((accessToken) => {
        return backendClient.auth.exportAccountData(accessToken);
      });

      const dialogOptions = {
        title: "Hesap verilerini kaydet",
        defaultPath: "connect-hesap-verilerim.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      // Modal to the requesting window when there is one; the parentless
      // overload is a different signature, not an optional argument.
      const target = window
        ? await dialog.showSaveDialog(window, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);

      if (target.canceled || !target.filePath) {
        return ok({ saved: false });
      }

      await writeFile(target.filePath, JSON.stringify(data, null, 2), "utf8");
      return ok({ saved: true, path: target.filePath });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-session", async () => {
    try {
      await ensureFreshSession();
      return ok(getSessionSnapshot());
    } catch (error) {
      if (
        error instanceof DesktopApiError &&
        // A banned account answers 403 USER_BANNED, not 401, so the session
        // file used to survive and the app stayed mounted with every request
        // failing until a restart.
        // ACCOUNT_DEACTIVATED is the same shape: a 403 that means "this
        // session is over", not "retry later".
        (error.statusCode === 401 ||
          error.code === "USER_BANNED" ||
          error.code === "ACCOUNT_DEACTIVATED")
      ) {
        // endSession rather than a bare clear(): the websocket managers have to
        // stop retrying with the dead token, and every window has to hear about
        // it, not just the one that happened to ask.
        endSession(error.code);
        return ok(getSessionSnapshot());
      }

      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-profile", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.getSettingsProfile(accessToken);
      });

      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-profile-update", async (_event, payload: unknown) => {
    try {
      const parsed = updateProfileSchema.parse(payload);
      // Clean up zod null/undefined logic
      const req = {
        displayName: parsed.displayName,
        email: parsed.email ?? null,
        bio: parsed.bio ?? null,
        avatarUrl: parsed.avatarUrl ?? null,
        bannerUrl: parsed.bannerUrl ?? null,
      };

      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.updateSettingsProfile(accessToken, req);
      });

      const current = getSessionStore().get();
      if (current) {
        getSessionStore().set({
          ...current,
          user: {
            ...current.user,
            displayName: result.profile.displayName,
            avatarUrl: result.profile.avatarUrl,
            bannerUrl: result.profile.bannerUrl,
          },
        });
      }

      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-users", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.getRegisteredUsers(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  // The directory is friends-only, so a stranger is reachable only by typing
  // their handle exactly. Same bounds as a friend request: the same handles.
  ipcMain.handle("desktop:auth-user-lookup", async (_event, payload: unknown) => {
    try {
      const parsed = friendRequestSendSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.lookupUserByUsername(accessToken, parsed.username);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  // Same {userId} shape as a block, so the block schema is reused rather than
  // cloned — two copies of "what is a user id" is how they drift apart.
  ipcMain.handle("desktop:auth-user-card", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.getUserCard(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-presence", async (_event, payload: unknown) => {
    try {
      const parsed = setPresenceSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.setPresence(accessToken, parsed.status);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-blocks", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.listBlockedUsers(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-block", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.blockUser(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-unblock", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.unblockUser(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-friends", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.listFriends(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-friend-requests", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.listFriendRequests(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-friend-request-send", async (_event, payload: unknown) => {
    try {
      const parsed = friendRequestSendSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.sendFriendRequest(accessToken, parsed.username);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-friend-accept", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.acceptFriendRequest(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  // Unfriend, reject and cancel all land here: one edge, one delete.
  ipcMain.handle("desktop:auth-friend-remove", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.removeFriend(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-privacy", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.getPrivacySettings(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:auth-privacy-update", async (_event, payload: unknown) => {
    try {
      const parsed = updatePrivacySchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.updatePrivacySettings(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:user-directory-stream-start", async (event) => {
    try {
      await withAccessToken(async (accessToken) => {
        // Awaited: start now resolves only once the socket is open, so a
        // failure propagates and the renderer's backoff actually escalates.
        await userDirectoryStreamManager.start(event.sender, accessToken);
      });

      return ok({ started: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:user-directory-stream-stop", async (event) => {
    try {
      userDirectoryStreamManager.stop(event.sender.id);
      return ok({ stopped: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-users", async (_event, params?: unknown) => {
    try {
      const parsed = adminListUsersSchema.parse(params);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListUsers(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-get-user", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminGetUser(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-update-user", async (_event, arg: unknown) => {
    try {
      const { userId, payload } = adminUpdateUserSchema.parse(arg);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminUpdateUser(accessToken, userId, payload);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-reset-password", async (_event, arg: unknown) => {
    try {
      const { userId, newPassword } = adminResetPasswordSchema.parse(arg);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminResetPassword(accessToken, userId, { newPassword });
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-delete-user", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminDeleteUser(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-ban-user", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminBanUser(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-unban-user", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminUnbanUser(accessToken, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-voice-mutes", async () => {
    try {
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminListVoiceMutes(accessToken),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-set-voice-mute", async (_event, payload: unknown) => {
    try {
      const parsed = adminVoiceMuteSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminSetVoiceMute(
          accessToken,
          parsed.userId,
          parsed.muted,
          parsed.durationSeconds,
        ),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-timeouts", async () => {
    try {
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminListTimeouts(accessToken),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-clear-timeout", async (_event, payload: unknown) => {
    try {
      const parsed = adminClearTimeoutSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminClearTimeout(accessToken, parsed.lobbyId, parsed.userId),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-get-settings", async () => {
    try {
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminGetSettings(accessToken),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-update-settings", async (_event, payload: unknown) => {
    try {
      const parsed = adminSettingsPatchSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminUpdateSettings(accessToken, parsed),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-clear-profile-media", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminClearProfileMedia(accessToken, userId),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-set-email-verified", async (_event, payload: unknown) => {
    try {
      const parsed = adminEmailVerifiedSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminSetEmailVerified(accessToken, parsed.userId, parsed.verified),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-cancel-deletion", async (_event, userId: string) => {
    try {
      const result = await withAccessToken((accessToken) =>
        backendClient.auth.adminCancelDeletion(accessToken, userId),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-lobbies", async (_event, params?: unknown) => {
    try {
      const parsed = adminListLobbiesSchema.parse(params);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListLobbies(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-lobby-events", async (_event, payload: unknown) => {
    try {
      const parsed = adminListLobbyEventsSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListLobbyEvents(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-get-stats", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminGetStats(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-force-logout", async (_event, payload: unknown) => {
    try {
      const parsed = blockUserSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminForceLogout(accessToken, parsed.userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-list-emotes", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListEmotes(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-delete-emote", async (_event, payload: unknown) => {
    try {
      const parsed = emoteIdSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminDeleteEmote(accessToken, parsed.emoteId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-set-emote-quota", async (_event, payload: unknown) => {
    try {
      const parsed = adminEmoteQuotaSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminSetEmoteQuota(accessToken, parsed);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:admin-kick-user", async (_event, { lobbyId, userId }: { lobbyId: string; userId: string }) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminKickUser(accessToken, lobbyId, userId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });
}
