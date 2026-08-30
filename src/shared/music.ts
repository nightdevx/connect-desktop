export const MUSIC_BOT_IDENTITY_PREFIX = "bot:music:";

// music.BotDisplayName on the server, which is what LiveKit carries as the
// participant name. Written down here as well because both the stage tile and
// the sidebar row are built without a roster entry to read it from.
export const MUSIC_BOT_NAME = "Müzik Botu";

export const musicBotIdentity = (lobbyId: string): string =>
  `${MUSIC_BOT_IDENTITY_PREFIX}${lobbyId}`;

export const isMusicBotIdentity = (identity: string): boolean =>
  identity.startsWith(MUSIC_BOT_IDENTITY_PREFIX);

export type MusicSource = "youtube" | "spotify" | "search";

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
  source: MusicSource;
  durationSeconds: number;
  uploader?: string;
  requestedBy: string;
  requestedByName: string;
  queuedAt: string;
}

export type MusicLogKind = "command" | "info" | "error";

export interface MusicLogLine {
  at: string;
  kind: MusicLogKind;
  text: string;
}

export interface MusicState {
  lobbyId: string;
  enabled: boolean;
  connected: boolean;
  botIdentity: string;
  nowPlaying: MusicTrack | null;
  positionSeconds: number;
  paused: boolean;
  queue: MusicTrack[];
  log: MusicLogLine[];
  revision: number;
}

export interface MusicCommandSpec {
  name: string;
  aliases: string[] | null;
  usage: string;
  summary: string;
  djOnly: boolean;
  admin: boolean;
}

export interface MusicCatalog {
  enabled: boolean;
  spotifyEnabled: boolean;
  commands: MusicCommandSpec[];
}

export interface MusicDJ {
  userId: string;
  username: string;
  displayName: string;
  grantedBy: string;
  grantedAt: string;
}

export const emptyMusicState = (lobbyId: string): MusicState => ({
  lobbyId,
  enabled: false,
  connected: false,
  botIdentity: musicBotIdentity(lobbyId),
  nowPlaying: null,
  positionSeconds: 0,
  paused: false,
  queue: [],
  log: [],
  revision: 0,
});

export const formatMusicDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--:--";
  }

  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};
