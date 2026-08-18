import {
  Room,
  RoomEvent,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  DisconnectReason,
} from "livekit-client";
import { logLiveKitDebug } from "@/services/debug-log";
import { LiveKitStreamManagerCallbacks } from "./types";
import { shouldSubscribePublication } from "./constants";
import { RemoteMediaHandler } from "./remote-media-handler";

export class RoomEventManager {
  public constructor(
    private readonly room: Room,
    private readonly callbacks: LiveKitStreamManagerCallbacks,
    private readonly remoteMediaHandler: RemoteMediaHandler,
    private readonly updateMediaMap: () => void,
    private readonly onDisconnected: (reason?: DisconnectReason) => void,
    private readonly restorePublishingState: () => Promise<void>,
    // Screen shares are opt-in, so publication alone must not subscribe.
    private readonly isWatchingScreen: (identity: string) => boolean,
  ) {}

  public registerEvents() {
    this.room
      .on(RoomEvent.Connected, this.handleConnected)
      .on(RoomEvent.Reconnecting, this.handleReconnecting)
      .on(RoomEvent.Reconnected, this.handleReconnected)
      .on(RoomEvent.Disconnected, this.onDisconnected)
      .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected)
      .on(RoomEvent.TrackPublished, this.handleTrackPublished)
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

  private readonly handleTrackPublished = (
    pub: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    // Manual subscription because autoSubscribe is disabled in RoomOptions.
    //
    // While deafened we deliberately stay unsubscribed from audio — otherwise
    // a track published mid-deafen would quietly start costing bandwidth again.
    // And a screen share is never subscribed on publication alone: opening a
    // share used to start pushing video to every person in the room whether
    // they wanted it or not; now it only lights up a "watch" affordance, and
    // the bytes start flowing when someone actually asks for them.
    const subscribe = shouldSubscribePublication({
      kind: pub.kind,
      source: pub.source,
      deafened: this.remoteMediaHandler.isDeafenedNow(),
      watchingScreen: this.isWatchingScreen(participant.identity),
    });

    if (subscribe) {
      void pub.setSubscribed(true);
    }

    // Refresh either way: a publication we deliberately do not subscribe to is
    // still news. micEnabled is read straight off it, and leaving the map stale
    // here is how a deafened viewer's roster showed a microphone icon that had
    // not been true for minutes — and how a starting screen share failed to
    // light up its "watch" affordance. Subscription is asynchronous, so
    // TrackSubscribed can be a round trip away; the publication's own state
    // (source, muted) is already known now, and the roster reads it.
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
