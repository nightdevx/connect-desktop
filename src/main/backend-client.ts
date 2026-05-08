import { AuthClient } from "./clients/auth-client";
import { BaseClient, DesktopApiError } from "./clients/base-client";
import { ChatClient } from "./clients/chat-client";
import { LobbyClient } from "./clients/lobby-client";
import { MediaClient } from "./clients/media-client";

export class BackendClient {
  public readonly base: BaseClient;
  public readonly auth: AuthClient;
  public readonly lobby: LobbyClient;
  public readonly media: MediaClient;
  public readonly chat: ChatClient;

  public constructor(baseUrl: string) {
    this.base = new BaseClient(baseUrl);
    this.auth = new AuthClient(this.base);
    this.lobby = new LobbyClient(this.base);
    this.media = new MediaClient(this.base);
    this.chat = new ChatClient(this.base);
  }
}

export { DesktopApiError };
