export const MUSIC_COMMAND_PREFIX = "!";

export const MUSIC_BOT_IDENTITY_PREFIX = "bot:music:";

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
  prefix: string;
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
