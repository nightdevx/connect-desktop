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
  private readonly participantVolumes = new Map<string, number>();
  private readonly participantMutes = new Map<string, boolean>();
  private readonly remoteAudioElements = new Map<string, HTMLAudioElement>();
  private currentOutputDeviceId: string | null = null;
  private isDeafened = false;

  public constructor(private readonly room: Room) {}

  /**
   * @deprecated AudioContext kullanımından HTMLAudioElement yönetimine geçildi (AEC uyumluluğu için).
   */
  public getOrCreateRemoteAudioContext(): AudioContext | null {
    return null;
  }

  public handleTrackSubscribed(
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      this.attachRemoteAudioTrack(track, participant);
    }
    updateMedia();
  }

  public handleTrackUnsubscribed(
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      this.detachRemoteAudioTrack(participant);
    }
    updateMedia();
  }

  private attachRemoteAudioTrack(track: RemoteTrack, participant: Participant) {
    this.detachRemoteAudioTrack(participant);

    if (typeof document === "undefined") return;

    const audioEl = document.createElement("audio");
    audioEl.id = `remote-audio-${participant.identity}`;
    audioEl.autoplay = true;
    audioEl.style.display = "none";
    // Echo cancellation için HTMLAudioElement kullanımı en sağlıklı yoldur
    document.body.appendChild(audioEl);

    const volume = this.participantVolumes.get(participant.identity) ?? 1;
    const isMuted = this.participantMutes.get(participant.identity) ?? false;

    audioEl.volume = (this.isDeafened || isMuted) ? 0 : volume;
    
    // Uygulanan ses çıkış cihazını ayarla
    if (this.currentOutputDeviceId) {
      const sinkTarget = audioEl as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (typeof sinkTarget.setSinkId === "function") {
        void sinkTarget.setSinkId(this.currentOutputDeviceId).catch((err) => {
          logLiveKitDebug("remote-media", "set-sink-id-failed", {
            identity: participant.identity,
            deviceId: this.currentOutputDeviceId,
            error: err
          });
        });
      }
    }

    track.attach(audioEl);

    this.remoteAudioElements.set(participant.identity, audioEl);
    
    logLiveKitDebug("remote-media", "audio-attached", {
      identity: participant.identity,
      volume: audioEl.volume
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

  public setParticipantVolume(identity: string, volume: number) {
    this.participantVolumes.set(identity, volume);
    const audioEl = this.remoteAudioElements.get(identity);
    if (audioEl && !this.participantMutes.get(identity) && !this.isDeafened) {
      audioEl.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public setParticipantMuted(identity: string, muted: boolean) {
    this.participantMutes.set(identity, muted);
    const audioEl = this.remoteAudioElements.get(identity);
    if (audioEl) {
      const volume = (muted || this.isDeafened) ? 0 : (this.participantVolumes.get(identity) ?? 1);
      audioEl.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public setDeafened(deafened: boolean) {
    this.isDeafened = deafened;
    this.remoteAudioElements.forEach((audioEl, identity) => {
      const isMuted = this.participantMutes.get(identity) ?? false;
      const volume = (deafened || isMuted) ? 0 : (this.participantVolumes.get(identity) ?? 1);
      audioEl.volume = Math.max(0, Math.min(1, volume));
    });
    
    logLiveKitDebug("remote-media", "deafen-changed", { deafened });
  }

  public async setAudioOutputDevice(deviceId: string | null) {
    const nextDeviceId = deviceId || "";
    if (this.currentOutputDeviceId === nextDeviceId) return;

    this.currentOutputDeviceId = nextDeviceId;
    logLiveKitDebug("remote-media", "switching-output-device", { deviceId: nextDeviceId });

    const promises: Promise<void>[] = [];
    this.remoteAudioElements.forEach((audioEl) => {
      const sinkTarget = audioEl as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (typeof sinkTarget.setSinkId === "function") {
        promises.push(sinkTarget.setSinkId(nextDeviceId).catch((err) => {
          logLiveKitDebug("remote-media", "set-sink-id-change-failed", {
            id: audioEl.id,
            error: err
          });
        }));
      }
    });

    await Promise.all(promises);
  }

  public dispose() {
    this.remoteAudioElements.forEach((el) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    this.remoteAudioElements.clear();
  }
}
