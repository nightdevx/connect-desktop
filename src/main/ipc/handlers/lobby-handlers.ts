import { ipcMain } from "electron";
import {
  backendClient,
  lobbyStreamManager,
  ok,
  fail,
  withAccessToken,
} from "../context";
import {
  createLobbySchema,
  updateLobbySchema,
  deleteLobbySchema,
  lobbyJoinSchema,
  lobbyLeaveSchema,
  lobbyMuteSchema,
  lobbyDeafenSchema,
  lobbyEnabledSchema,
  lobbyStateSchema,
  lobbyMessagesListSchema,
  lobbyMessageSendSchema,
  lobbyMessageDeleteSchema,
  liveKitTokenSchema,
  initiateCallSchema,
  acceptCallSchema,
  rejectCallSchema,
  cancelCallSchema,
} from "../validators";

export function registerLobbyHandlers(): void {
  ipcMain.handle("desktop:lobbies-list", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.listLobbies(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-states", async () => {
    try {
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.listLobbyStates(accessToken);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-create", async (_event, payload: unknown) => {
    try {
      const parsed = createLobbySchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.createLobby(accessToken, parsed.name);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-update", async (_event, payload: unknown) => {
    try {
      const parsed = updateLobbySchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.updateLobby(
          accessToken,
          parsed.lobbyId,
          parsed.name,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-delete", async (_event, payload: unknown) => {
    try {
      const parsed = deleteLobbySchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.deleteLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-join", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyJoinSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.joinLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-leave", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyLeaveSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.leaveLobby(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-mute", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyMuteSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.setLobbyMuted(
          accessToken,
          parsed.lobbyId,
          parsed.muted,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-deafen", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyDeafenSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.setLobbyDeafened(
          accessToken,
          parsed.lobbyId,
          parsed.deafened,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-camera", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyEnabledSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.setLobbyCameraEnabled(
          accessToken,
          parsed.lobbyId,
          parsed.enabled,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-screen", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyEnabledSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.setLobbyScreenSharing(
          accessToken,
          parsed.lobbyId,
          parsed.enabled,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-stream-start", async (event) => {
    try {
      await withAccessToken(async (accessToken) => {
        lobbyStreamManager.start(event.sender, accessToken);
      });
      return ok({ started: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-stream-stop", async (event) => {
    try {
      lobbyStreamManager.stop(event.sender.id);
      return ok({ stopped: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:livekit-token", async (_event, payload: unknown) => {
    try {
      const parsed = liveKitTokenSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.media.createLiveKitToken(accessToken, parsed.room);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobbies-state", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyStateSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.lobby.getLobbyState(accessToken, parsed.lobbyId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-messages-list", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyMessagesListSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.listLobbyMessages(
          accessToken,
          parsed.lobbyId,
          parsed.limit,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-messages-send", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyMessageSendSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.sendLobbyMessage(
          accessToken,
          parsed.lobbyId,
          parsed.body,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-messages-delete", async (_event, payload: unknown) => {
    try {
      const parsed = lobbyMessageDeleteSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.chat.deleteMessage(
          accessToken,
          parsed.messageId,
        );
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:call-initiate", async (_event, payload: unknown) => {
    try {
      const parsed = initiateCallSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.media.initiateCall(accessToken, parsed.targetUserId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:call-accept", async (_event, payload: unknown) => {
    try {
      const parsed = acceptCallSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.media.acceptCall(accessToken, parsed.callId, parsed.callerId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:call-reject", async (_event, payload: unknown) => {
    try {
      const parsed = rejectCallSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.media.rejectCall(accessToken, parsed.callId, parsed.callerId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("desktop:call-cancel", async (_event, payload: unknown) => {
    try {
      const parsed = cancelCallSchema.parse(payload);
      const result = await withAccessToken((accessToken) => {
        return backendClient.media.cancelCall(accessToken, parsed.callId, parsed.targetUserId);
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });
}

