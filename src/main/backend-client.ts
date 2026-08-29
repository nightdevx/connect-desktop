import { AdminOpsClient } from "./clients/admin-ops-client";
import { AuthClient } from "./clients/auth-client";
import { BaseClient, DesktopApiError } from "./clients/base-client";
import { ChatClient } from "./clients/chat-client";
import { LobbyClient } from "./clients/lobby-client";
import { MediaClient } from "./clients/media-client";
import { MinigameClient } from "./clients/minigame-client";
import { MusicClient } from "./clients/music-client";
import { WatchClient } from "./clients/watch-client";

export class BackendClient {
  public readonly base: BaseClient;
  public readonly auth: AuthClient;
  public readonly lobby: LobbyClient;
  public readonly media: MediaClient;
  public readonly chat: ChatClient;
  public readonly minigame: MinigameClient;
  public readonly music: MusicClient;
  public readonly watch: WatchClient;
  public readonly adminOps: AdminOpsClient;

  public constructor(baseUrl: string) {
    this.base = new BaseClient(baseUrl);
    this.auth = new AuthClient(this.base);
    this.lobby = new LobbyClient(this.base);
    this.media = new MediaClient(this.base);
    this.chat = new ChatClient(this.base);
    this.minigame = new MinigameClient(this.base);
    this.music = new MusicClient(this.base);
    this.watch = new WatchClient(this.base);
    this.adminOps = new AdminOpsClient(this.base);
  }
}

export { DesktopApiError };
