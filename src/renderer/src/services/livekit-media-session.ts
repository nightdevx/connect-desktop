import {
  Room,
  RoomEvent,
  Track,
  type DisconnectReason,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import workspaceService from "./workspace-service";

export interface ParticipantMediaStreams {
  camera: MediaStream | null;
  screen: MediaStream | null;
}

export type ParticipantMediaMap = Record<string, ParticipantMediaStreams>;

interface LiveKitMediaSessionCallbacks {
  onRemoteStreamsChanged: (streams: ParticipantMediaMap) => void;
  onConnectionStateChanged?: (
    state: "connecting" | "connected" | "reconnecting" | "disconnected",
  ) => void;
  onWarning?: (message: string) => void;
}

const EMPTY_STREAMS: ParticipantMediaStreams = {
  camera: null,
  screen: null,
};

const cloneMediaStreams = (
  streams: Map<string, ParticipantMediaStreams>,
): ParticipantMediaMap => {
  const next: ParticipantMediaMap = {};
  streams.forEach((value, key) => {
    next[key] = {
      camera: value.camera,
      screen: value.screen,
    };
  });

  return next;
};

const buildSingleTrackStream = (track: MediaStreamTrack): MediaStream => {
  return new MediaStream([track]);
};

export class LiveKitMediaSession {
  private room: Room | null = null;
  private currentLobbyId: string | null = null;
  private remoteStreams = new Map<string, ParticipantMediaStreams>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private remoteAudioCleanups = new Map<string, () => void>();
  private remoteAudioTrackOwners = new Map<string, string>();
  private remoteAudioContext: AudioContext | null = null;
  private publishedCameraTrack: MediaStreamTrack | null = null;
  private publishedScreenVideoTrack: MediaStreamTrack | null = null;
  private publishedScreenAudioTrack: MediaStreamTrack | null = null;

  public constructor(
    private readonly callbacks: LiveKitMediaSessionCallbacks,
  ) {}

  public async connect(lobbyId: string): Promise<void> {
    if (
      this.room &&
      this.currentLobbyId === lobbyId &&
      this.room.state === "connected"
    ) {
      return;
    }

    this.callbacks.onConnectionStateChanged?.("connecting");
    await this.disconnect();

    const tokenResult = await workspaceService.createLiveKitToken({
      room: lobbyId,
    });
    if (!tokenResult.ok || !tokenResult.data) {
      throw new Error(tokenResult.error?.message ?? "LiveKit token alınamadı");
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
    });

    this.room = room;
    this.currentLobbyId = lobbyId;

    room.on(RoomEvent.Reconnecting, () => {
      this.callbacks.onConnectionStateChanged?.("reconnecting");
    });

    room.on(RoomEvent.Reconnected, () => {
      this.callbacks.onConnectionStateChanged?.("connected");
    });

    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.callbacks.onConnectionStateChanged?.("disconnected");
      this.clearRemoteState();

      if (reason) {
        this.callbacks.onWarning?.(`LiveKit bağlantısı kapandı: ${reason}`);
      }
    });

    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant,
      ) => {
        this.handleTrackSubscribed(participant.identity, track, publication);
      },
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant,
      ) => {
        this.handleTrackUnsubscribed(participant.identity, track, publication);
      },
    );

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.removeRemoteAudioForIdentity(participant.identity);
      this.remoteStreams.delete(participant.identity);
      this.callbacks.onRemoteStreamsChanged(
        cloneMediaStreams(this.remoteStreams),
      );
    });

    await room.connect(tokenResult.data.serverUrl, tokenResult.data.token, {
      autoSubscribe: true,
    });

    this.callbacks.onConnectionStateChanged?.("connected");
  }

  public async disconnect(): Promise<void> {
    this.removeAllRemoteAudioElements();
    this.clearRemoteState();

    const activeRoom = this.room;
    this.room = null;
    this.currentLobbyId = null;

    this.publishedCameraTrack = null;
    this.publishedScreenVideoTrack = null;
    this.publishedScreenAudioTrack = null;

    if (activeRoom) {
      await activeRoom.disconnect(false);
    }

    this.callbacks.onConnectionStateChanged?.("disconnected");
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.room.localParticipant.setMicrophoneEnabled(enabled, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  }

  public async publishCameraStream(stream: MediaStream): Promise<void> {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error("Kamera videosu bulunamadı");
    }

    if (!this.room) {
      throw new Error("LiveKit bağlantısı hazır değil");
    }

    await this.unpublishCamera();
    await this.room.localParticipant.publishTrack(track, {
      source: Track.Source.Camera,
      simulcast: true,
    });
    this.publishedCameraTrack = track;
  }

  public async unpublishCamera(): Promise<void> {
    if (!this.room || !this.publishedCameraTrack) {
      this.publishedCameraTrack = null;
      return;
    }

    await this.room.localParticipant.unpublishTrack(
      this.publishedCameraTrack,
      false,
    );
    this.publishedCameraTrack = null;
  }

  public async publishScreenStream(stream: MediaStream): Promise<void> {
    if (!this.room) {
      throw new Error("LiveKit bağlantısı hazır değil");
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error("Yayın videosu bulunamadı");
    }

    await this.unpublishScreen();

    await this.room.localParticipant.publishTrack(videoTrack, {
      source: Track.Source.ScreenShare,
      simulcast: true,
    });
    this.publishedScreenVideoTrack = videoTrack;

    const audioTrack = stream.getAudioTracks()[0] ?? null;
    if (audioTrack) {
      await this.room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
      });
      this.publishedScreenAudioTrack = audioTrack;
    }
  }

  public async unpublishScreen(): Promise<void> {
    if (!this.room) {
      this.publishedScreenVideoTrack = null;
      this.publishedScreenAudioTrack = null;
      return;
    }

    if (this.publishedScreenVideoTrack) {
      await this.room.localParticipant.unpublishTrack(
        this.publishedScreenVideoTrack,
        false,
      );
      this.publishedScreenVideoTrack = null;
    }

    if (this.publishedScreenAudioTrack) {
      await this.room.localParticipant.unpublishTrack(
        this.publishedScreenAudioTrack,
        false,
      );
      this.publishedScreenAudioTrack = null;
    }
  }

  private clearRemoteState(): void {
    this.remoteStreams.clear();
    this.callbacks.onRemoteStreamsChanged({});
  }

  private handleTrackSubscribed(
    identity: string,
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      this.attachRemoteAudio(track, publication, identity);
      return;
    }

    const previous = this.remoteStreams.get(identity) ?? EMPTY_STREAMS;
    const source = publication.source;

    const next: ParticipantMediaStreams = {
      camera: previous.camera,
      screen: previous.screen,
    };

    if (source === Track.Source.Camera) {
      next.camera = buildSingleTrackStream(track.mediaStreamTrack);
    }

    if (source === Track.Source.ScreenShare) {
      next.screen = buildSingleTrackStream(track.mediaStreamTrack);
    }

    this.remoteStreams.set(identity, next);
    this.callbacks.onRemoteStreamsChanged(
      cloneMediaStreams(this.remoteStreams),
    );
  }

  private handleTrackUnsubscribed(
    identity: string,
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      this.detachRemoteAudio(publication.trackSid);
      return;
    }

    const previous = this.remoteStreams.get(identity);
    if (!previous) {
      return;
    }

    const source = publication.source;
    const next: ParticipantMediaStreams = {
      camera: previous.camera,
      screen: previous.screen,
    };

    if (source === Track.Source.Camera) {
      next.camera = null;
    }

    if (source === Track.Source.ScreenShare) {
      next.screen = null;
    }

    if (!next.camera && !next.screen) {
      this.remoteStreams.delete(identity);
    } else {
      this.remoteStreams.set(identity, next);
    }

    this.callbacks.onRemoteStreamsChanged(
      cloneMediaStreams(this.remoteStreams),
    );
  }

  private attachRemoteAudio(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participantIdentity: string,
  ): void {
    this.detachRemoteAudio(publication.trackSid);

    const stream = buildSingleTrackStream(track.mediaStreamTrack);
    const webAudioCleanup = this.attachRemoteAudioWithWebAudio(
      stream,
      track.mediaStreamTrack,
    );

    if (webAudioCleanup) {
      this.remoteAudioCleanups.set(publication.trackSid, webAudioCleanup);
      this.remoteAudioTrackOwners.set(
        publication.trackSid,
        participantIdentity,
      );
      return;
    }

    const audioElement = track.attach() as HTMLAudioElement;
    audioElement.autoplay = true;
    audioElement.dataset.livekitTrackSid = publication.trackSid;
    audioElement.style.display = "none";
    document.body.appendChild(audioElement);
    this.remoteAudioElements.set(publication.trackSid, audioElement);
    this.remoteAudioTrackOwners.set(publication.trackSid, participantIdentity);
  }

  private detachRemoteAudio(trackSid: string): void {
    const cleanup = this.remoteAudioCleanups.get(trackSid);
    if (cleanup) {
      cleanup();
      this.remoteAudioCleanups.delete(trackSid);
    }

    const existing = this.remoteAudioElements.get(trackSid);
    if (!existing) {
      this.remoteAudioTrackOwners.delete(trackSid);
      this.closeRemoteAudioContextIfIdle();
      return;
    }

    existing.remove();
    this.remoteAudioElements.delete(trackSid);
    this.remoteAudioTrackOwners.delete(trackSid);
    this.closeRemoteAudioContextIfIdle();
  }

  private removeRemoteAudioForIdentity(identity: string): void {
    const relatedTrackSIDs: string[] = [];

    this.remoteAudioTrackOwners.forEach((ownerIdentity, trackSid) => {
      if (ownerIdentity === identity) {
        relatedTrackSIDs.push(trackSid);
      }
    });

    relatedTrackSIDs.forEach((trackSid) => {
      this.detachRemoteAudio(trackSid);
    });
  }

  private removeAllRemoteAudioElements(): void {
    this.remoteAudioCleanups.forEach((cleanup) => {
      cleanup();
    });
    this.remoteAudioCleanups.clear();

    this.remoteAudioElements.forEach((element) => {
      element.remove();
    });
    this.remoteAudioElements.clear();
    this.remoteAudioTrackOwners.clear();
    this.closeRemoteAudioContextIfIdle();
  }

  private getRemoteAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.remoteAudioContext) {
      return this.remoteAudioContext;
    }

    const Ctx =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    this.remoteAudioContext = new Ctx();
    return this.remoteAudioContext;
  }

  private attachRemoteAudioWithWebAudio(
    stream: MediaStream,
    track: MediaStreamTrack,
  ): (() => void) | null {
    const context = this.getRemoteAudioContext();
    if (!context) {
      return null;
    }

    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(1, context.currentTime);

    let splitterNode: ChannelSplitterNode | null = null;
    let mergerNode: ChannelMergerNode | null = null;
    let outputNode: AudioNode = source;

    const channelCountFromSettings = track.getSettings().channelCount;
    const effectiveChannelCount =
      typeof channelCountFromSettings === "number" &&
      Number.isFinite(channelCountFromSettings)
        ? channelCountFromSettings
        : source.channelCount;

    // Duplicate mono remote streams into L/R so headphone output stays centered.
    if (effectiveChannelCount <= 1) {
      splitterNode = context.createChannelSplitter(1);
      mergerNode = context.createChannelMerger(2);

      source.connect(splitterNode);
      splitterNode.connect(mergerNode, 0, 0);
      splitterNode.connect(mergerNode, 0, 1);
      outputNode = mergerNode;
    }

    outputNode.connect(gainNode);
    gainNode.connect(context.destination);
    void context.resume().catch(() => undefined);

    return () => {
      try {
        source.disconnect();
      } catch {
        // no-op
      }

      try {
        splitterNode?.disconnect();
      } catch {
        // no-op
      }

      try {
        mergerNode?.disconnect();
      } catch {
        // no-op
      }

      try {
        gainNode.disconnect();
      } catch {
        // no-op
      }
    };
  }

  private closeRemoteAudioContextIfIdle(): void {
    if (
      !this.remoteAudioContext ||
      this.remoteAudioCleanups.size > 0 ||
      this.remoteAudioElements.size > 0
    ) {
      return;
    }

    const context = this.remoteAudioContext;
    this.remoteAudioContext = null;
    void context.close().catch(() => undefined);
  }
}
