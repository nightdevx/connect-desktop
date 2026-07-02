import {
  Participant,
  Room,
  Track,
  RemoteTrackPublication,
  RemoteTrack,
  RemoteParticipant,
} from "livekit-client";
import { logLiveKitDebug } from "../debug-log";

export class RemoteMediaHandler {
  // ---- Microphone audio ----
  private readonly participantVolumes = new Map<string, number>();
  private readonly participantMutes = new Map<string, boolean>();
  private readonly remoteAudioElements = new Map<string, HTMLAudioElement>();

  // ---- Screen share audio ----
  private readonly screenAudioVolumes = new Map<string, number>();
  private readonly screenAudioMutes = new Map<string, boolean>();
  private readonly screenAudioElements = new Map<string, HTMLAudioElement>();

  private currentOutputDeviceId: string | null = null;
  private isDeafened = false;
  private masterVolume = 1.0;

  public constructor(private readonly room: Room) {}

  /**
   * @deprecated AudioContext kullanımından HTMLAudioElement yönetimine geçildi (AEC uyumluluğu için).
   */
  public getOrCreateRemoteAudioContext(): AudioContext | null {
    return null;
  }

  public handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      if (publication.source === Track.Source.ScreenShareAudio) {
        this.attachScreenAudioTrack(track, participant);
      } else {
        this.attachRemoteAudioTrack(track, participant);
      }
    }
    updateMedia();
  }

  public handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      if (publication.source === Track.Source.ScreenShareAudio) {
        this.detachScreenAudioTrack(participant);
      } else {
        this.detachRemoteAudioTrack(participant);
      }
    }
    updateMedia();
  }

  // ---- Microphone audio helpers ----

  private attachRemoteAudioTrack(track: RemoteTrack, participant: Participant) {
    this.detachRemoteAudioTrack(participant);

    if (typeof document === "undefined") return;

    const audioEl = document.createElement("audio");
    audioEl.id = `remote-audio-${participant.identity}`;
    audioEl.autoplay = true;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);

    const volume = this.participantVolumes.get(participant.identity) ?? 1;
    const isMuted = this.participantMutes.get(participant.identity) ?? false;

    audioEl.volume = Math.max(0, Math.min(1, (this.isDeafened || isMuted) ? 0 : volume * this.masterVolume));

    this.applySinkId(audioEl, participant.identity);
    track.attach(audioEl);
    this.remoteAudioElements.set(participant.identity, audioEl);

    console.log(`[RemoteMediaHandler] Remote audio attached for ${participant.identity}`, {
      volume: audioEl.volume,
      muted: isMuted,
      trackId: track.sid,
    });

    audioEl.play().catch(err => {
      console.warn(`[RemoteMediaHandler] Remote audio play() failed for ${participant.identity}:`, err);
    });

    logLiveKitDebug("remote-media", "audio-attached", {
      identity: participant.identity,
      volume: audioEl.volume,
    });
  }

  private detachRemoteAudioTrack(participant: Participant) {
    const audioEl = this.remoteAudioElements.get(participant.identity);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      this.remoteAudioElements.delete(participant.identity);
    }
  }

  // ---- Screen share audio helpers ----

  private attachScreenAudioTrack(track: RemoteTrack, participant: Participant) {
    this.detachScreenAudioTrack(participant);

    if (typeof document === "undefined") return;

    const audioEl = document.createElement("audio");
    audioEl.id = `screen-audio-${participant.identity}`;
    audioEl.autoplay = true;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);

    const volume = this.screenAudioVolumes.get(participant.identity) ?? 1;
    const isMuted = this.screenAudioMutes.get(participant.identity) ?? false;

    audioEl.volume = Math.max(0, Math.min(1, (this.isDeafened || isMuted) ? 0 : volume * this.masterVolume));

    this.applySinkId(audioEl, participant.identity);
    track.attach(audioEl);
    this.screenAudioElements.set(participant.identity, audioEl);

    console.log(`[RemoteMediaHandler] Screen audio attached for ${participant.identity}`, {
      volume: audioEl.volume,
      muted: isMuted,
      trackId: track.sid,
    });

    // Explicitly call play to ensure audio starts even if autoplay is delayed
    audioEl.play().catch(err => {
      console.warn(`[RemoteMediaHandler] Screen audio play() failed for ${participant.identity}:`, err);
    });

    logLiveKitDebug("remote-media", "screen-audio-attached", {
      identity: participant.identity,
      volume: audioEl.volume,
    });
  }

  private detachScreenAudioTrack(participant: Participant) {
    const audioEl = this.screenAudioElements.get(participant.identity);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      this.screenAudioElements.delete(participant.identity);
    }
  }

  private applySinkId(audioEl: HTMLAudioElement, identity: string) {
    if (!this.currentOutputDeviceId) return;
    const sinkTarget = audioEl as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (typeof sinkTarget.setSinkId === "function") {
      void sinkTarget.setSinkId(this.currentOutputDeviceId).catch((err) => {
        logLiveKitDebug("remote-media", "set-sink-id-failed", {
          identity,
          deviceId: this.currentOutputDeviceId,
          error: err,
        });
      });
    }
  }

  // ---- Public mic volume/mute controls ----

  public setParticipantVolume(identity: string, volume: number) {
    this.participantVolumes.set(identity, volume);
    const audioEl = this.remoteAudioElements.get(identity);
    if (audioEl && !this.participantMutes.get(identity) && !this.isDeafened) {
      audioEl.volume = Math.max(0, Math.min(1, volume * this.masterVolume));
    }
  }

  public setParticipantMuted(identity: string, muted: boolean) {
    this.participantMutes.set(identity, muted);
    const audioEl = this.remoteAudioElements.get(identity);
    if (audioEl) {
      const participantVolume = this.participantVolumes.get(identity) ?? 1;
      const volume = (muted || this.isDeafened) ? 0 : participantVolume * this.masterVolume;
      audioEl.volume = Math.max(0, Math.min(1, volume));
    }
  }

  // ---- Public screen audio controls ----

  public setScreenAudioVolume(identity: string, volumePercent: number) {
    const volume = Math.max(0, volumePercent) / 100;
    this.screenAudioVolumes.set(identity, volume);
    const audioEl = this.screenAudioElements.get(identity);
    if (audioEl && !this.screenAudioMutes.get(identity) && !this.isDeafened) {
      audioEl.volume = Math.max(0, Math.min(1, volume * this.masterVolume));
    }
  }

  public setScreenAudioMuted(identity: string, muted: boolean) {
    this.screenAudioMutes.set(identity, muted);
    const audioEl = this.screenAudioElements.get(identity);
    if (audioEl) {
      const volume = this.screenAudioVolumes.get(identity) ?? 1;
      audioEl.volume = Math.max(0, Math.min(1, (muted || this.isDeafened) ? 0 : volume * this.masterVolume));
    }
  }

  public hasScreenAudio(identity: string): boolean {
    return this.screenAudioElements.has(identity);
  }

  // ---- Master volume ----

  public setMasterVolume(masterVolume: number) {
    // masterVolume: 0..200 range (percent), normalize to 0..2
    this.masterVolume = Math.max(0, masterVolume) / 100;

    // Re-apply to all mic audio elements
    this.remoteAudioElements.forEach((audioEl, identity) => {
      const isMuted = this.participantMutes.get(identity) ?? false;
      const participantVolume = this.participantVolumes.get(identity) ?? 1;
      audioEl.volume = Math.max(0, Math.min(1, (this.isDeafened || isMuted) ? 0 : participantVolume * this.masterVolume));
    });

    // Re-apply to all screen audio elements
    this.screenAudioElements.forEach((audioEl, identity) => {
      const isMuted = this.screenAudioMutes.get(identity) ?? false;
      const screenVolume = this.screenAudioVolumes.get(identity) ?? 1;
      audioEl.volume = Math.max(0, Math.min(1, (this.isDeafened || isMuted) ? 0 : screenVolume * this.masterVolume));
    });
  }

  // ---- Deafen ----

  public setDeafened(deafened: boolean) {
    this.isDeafened = deafened;

    this.remoteAudioElements.forEach((audioEl, identity) => {
      const isMuted = this.participantMutes.get(identity) ?? false;
      const participantVolume = this.participantVolumes.get(identity) ?? 1;
      const volume = (deafened || isMuted) ? 0 : participantVolume * this.masterVolume;
      audioEl.volume = Math.max(0, Math.min(1, volume));
    });

    this.screenAudioElements.forEach((audioEl, identity) => {
      const isMuted = this.screenAudioMutes.get(identity) ?? false;
      const screenVolume = this.screenAudioVolumes.get(identity) ?? 1;
      const volume = (deafened || isMuted) ? 0 : screenVolume * this.masterVolume;
      audioEl.volume = Math.max(0, Math.min(1, volume));
    });

    logLiveKitDebug("remote-media", "deafen-changed", { deafened });
  }

  // ---- Audio output device ----

  public async setAudioOutputDevice(deviceId: string | null) {
    const nextDeviceId = deviceId || "";
    if (this.currentOutputDeviceId === nextDeviceId) return;

    this.currentOutputDeviceId = nextDeviceId;
    logLiveKitDebug("remote-media", "switching-output-device", { deviceId: nextDeviceId });

    const promises: Promise<void>[] = [];

    const applyToEl = (audioEl: HTMLAudioElement) => {
      const sinkTarget = audioEl as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (typeof sinkTarget.setSinkId === "function") {
        promises.push(sinkTarget.setSinkId(nextDeviceId).catch((err) => {
          logLiveKitDebug("remote-media", "set-sink-id-change-failed", {
            id: audioEl.id,
            error: err,
          });
        }));
      }
    };

    this.remoteAudioElements.forEach(applyToEl);
    this.screenAudioElements.forEach(applyToEl);

    await Promise.all(promises);
  }

  // ---- Dispose ----

  public dispose() {
    const disposeEl = (el: HTMLAudioElement) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    };

    this.remoteAudioElements.forEach(disposeEl);
    this.remoteAudioElements.clear();

    this.screenAudioElements.forEach(disposeEl);
    this.screenAudioElements.clear();
  }
}
