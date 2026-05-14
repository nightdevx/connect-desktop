export * from "./lobby-service";
export * from "./chat-service";
export * from "./user-service";

import lobbyService from "./lobby-service";
import chatService from "./chat-service";
import userService from "./user-service";

export const workspaceService = {
  ...lobbyService,
  ...chatService,
  ...userService,
};

export default workspaceService;

