import type { Track, RemoteTrack, RemoteTrackPublication } from "livekit-client";

export interface ParticipantMediaStreams {
  camera: Track | MediaStream | null;
  screen: Track | MediaStream | null;
}

export type ParticipantMediaMap = Record<string, ParticipantMediaStreams>;

export interface RemoteParticipantAudioPreference {
  muted: boolean;
  volumePercent: number;
}

export const DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE: RemoteParticipantAudioPreference = {
  muted: false,
  volumePercent: 100,
};

export class LiveKitTrackManager {
  private remoteStreams = new Map<string, ParticipantMediaStreams>();
  private remoteParticipantAudioPreferences = new Map<string, RemoteParticipantAudioPreference>();

  public getStreams(): ParticipantMediaMap {
    const next: ParticipantMediaMap = {};
    this.remoteStreams.forEach((value, key) => {
      next[key] = {
        camera: value.camera,
        screen: value.screen,
      };
    });
    return next;
  }

  public setPreference(identity: string, pref: RemoteParticipantAudioPreference) {
    this.remoteParticipantAudioPreferences.set(identity, pref);
  }

  public getPreference(identity: string): RemoteParticipantAudioPreference {
    return this.remoteParticipantAudioPreferences.get(identity) ?? DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE;
  }

  public removeStreams(identity: string) {
    this.remoteStreams.delete(identity);
  }

  public updateTrack(identity: string, source: Track.Source, track: RemoteTrack | null) {
    const previous = this.remoteStreams.get(identity) ?? { camera: null, screen: null };
    const next = { ...previous };

    if (source === "camera" as unknown as Track.Source) {
      next.camera = track;
    }
    if (source === "screen_share" as unknown as Track.Source) {
      next.screen = track;
    }

    if (!next.camera && !next.screen) {
      this.remoteStreams.delete(identity);
    } else {
      this.remoteStreams.set(identity, next);
    }
  }

  public clear() {
    this.remoteStreams.clear();
  }
}
