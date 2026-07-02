import { ipcMain } from "electron";
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

    getSessionStore().clear();
    return ok(getSessionSnapshot());
  });

  ipcMain.handle("desktop:auth-session", async () => {
    try {
      await ensureFreshSession();
      return ok(getSessionSnapshot());
    } catch (error) {
      if (error instanceof DesktopApiError && error.statusCode === 401) {
        getSessionStore().clear();
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

  ipcMain.handle("desktop:user-directory-stream-start", async (event) => {
    try {
      await withAccessToken(async (accessToken) => {
        userDirectoryStreamManager.start(event.sender, accessToken);
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

  ipcMain.handle("desktop:admin-list-users", async (_event, params?: any) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListUsers(accessToken, params);
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

  ipcMain.handle("desktop:admin-update-user", async (_event, arg: { userId: string; payload: any }) => {
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

  ipcMain.handle("desktop:admin-reset-password", async (_event, arg: { userId: string; newPassword: any }) => {
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

  ipcMain.handle("desktop:admin-list-lobbies", async (_event, params?: any) => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.auth.adminListLobbies(accessToken, params);
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
