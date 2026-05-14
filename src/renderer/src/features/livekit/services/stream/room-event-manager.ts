import {
  Room,
  RoomEvent,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  DisconnectReason,
} from "livekit-client";
import { logLiveKitDebug } from "../debug-log";
import { LiveKitStreamManagerCallbacks } from "./types";
import { RemoteMediaHandler } from "./remote-media-handler";

export class RoomEventManager {
  public constructor(
    private readonly room: Room,
    private readonly callbacks: LiveKitStreamManagerCallbacks,
    private readonly remoteMediaHandler: RemoteMediaHandler,
    private readonly updateMediaMap: () => void,
    private readonly onDisconnected: (reason?: DisconnectReason) => void,
    private readonly restorePublishingState: () => Promise<void>,
  ) {}

  public registerEvents() {
    this.room
      .on(RoomEvent.Connected, this.handleConnected)
      .on(RoomEvent.Reconnecting, this.handleReconnecting)
      .on(RoomEvent.Reconnected, this.handleReconnected)
      .on(RoomEvent.Disconnected, this.onDisconnected)
      .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, this.updateMediaMap)
      .on(RoomEvent.TrackUnmuted, this.updateMediaMap)
      .on(RoomEvent.LocalTrackPublished, this.updateMediaMap)
      .on(RoomEvent.LocalTrackUnpublished, this.updateMediaMap)
      .on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged);
  }

  private readonly handleConnected = () => {
    logLiveKitDebug("stream-manager", "room-connected");
    this.callbacks.onConnectionStateChanged?.("connected");
  };

  private readonly handleReconnecting = () => {
    logLiveKitDebug("stream-manager", "room-reconnecting");
    this.callbacks.onConnectionStateChanged?.("reconnecting");
  };

  private readonly handleReconnected = () => {
    logLiveKitDebug("stream-manager", "room-reconnected");
    this.callbacks.onConnectionStateChanged?.("connected");
    void this.restorePublishingState();
  };

  private readonly handleParticipantConnected = (p: RemoteParticipant) => {
    logLiveKitDebug("stream-manager", "participant-connected", { identity: p.identity });
    this.updateMediaMap();
  };

  private readonly handleParticipantDisconnected = (p: RemoteParticipant) => {
    logLiveKitDebug("stream-manager", "participant-disconnected", { identity: p.identity });
    this.updateMediaMap();
  };

  private readonly handleTrackSubscribed = (
    track: RemoteTrack,
    pub: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    this.remoteMediaHandler.handleTrackSubscribed(track, pub, participant, this.updateMediaMap);
  };

  private readonly handleTrackUnsubscribed = (
    track: RemoteTrack,
    pub: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    this.remoteMediaHandler.handleTrackUnsubscribed(track, pub, participant, this.updateMediaMap);
  };

  private readonly handleActiveSpeakersChanged = (speakers: Participant[]) => {
    this.callbacks.onActiveSpeakersChanged?.(speakers.map(s => s.identity));
    this.updateMediaMap();
  };
}
