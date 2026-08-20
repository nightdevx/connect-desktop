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
import {
  resolveMicrophonePermission,
  shouldSubscribePublication,
} from "./constants";
import { RemoteMediaHandler } from "./remote-media-handler";

export class RoomEventManager {
  public constructor(
    private readonly room: Room,
    private readonly callbacks: LiveKitStreamManagerCallbacks,
    private readonly remoteMediaHandler: RemoteMediaHandler,
    private readonly updateMediaMap: () => void,
    private readonly onDisconnected: (reason?: DisconnectReason) => void,
    private readonly restorePublishingState: () => Promise<void>,
    // Re-runs the microphone half of restorePublishingState on its own. A
    // permission change must not touch the camera or a screen share: those are
    // expensive to republish and were never what the server revoked.
    private readonly reapplyMicrophoneState: () => Promise<void>,
    // Screen shares are opt-in, so publication alone must not subscribe.
    private readonly isWatchingScreen: (identity: string) => boolean,
    // Who is watching whose share, exchanged over the room data channel.
    // Grouped rather than spread across three more positional parameters.
    private readonly screenWatchPresence: {
      onData: (payload: Uint8Array, senderIdentity: string | undefined) => void;
      onPeerConnected: (identity: string) => void;
      onPeerDisconnected: (identity: string) => void;
    },
  ) {}

  // Whether the local participant may publish a microphone, as last observed.
  // null until the first permission arrives — see handlePermissionsChanged.
  private microphoneAllowed: boolean | null = null;

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
      .on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged)
      .on(RoomEvent.ParticipantPermissionsChanged, this.handlePermissionsChanged)
      .on(RoomEvent.DataReceived, this.handleDataReceived);
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

  // A moderator mute is enforced by taking the MICROPHONE source out of this
  // participant's publish grant, so this event is how the client finds out — in
  // both directions.
  //
  // Nothing listened for it, and that was the whole of the reported bug: the
  // server took the microphone away, LiveKit dropped the track, and the local
  // state still said "mic on". So when the mute was lifted and the grant came
  // back, nothing ever asked to publish again — `micEnabled` had not changed, so
  // the effect that pushes it into the session never re-ran. The user was
  // silent, their own button showed them unmuted, and the only way out was to
  // leave the room and rejoin.
  private readonly handlePermissionsChanged = (
    _previous: unknown,
    participant: Participant,
  ) => {
    if (participant.identity !== this.room.localParticipant.identity) {
      return;
    }

    // This manager is rebuilt per connection, so the baseline is per connection
    // too — which is what makes the first permission of a session a baseline and
    // not an announcement.
    const { allowed, announce, republish } = resolveMicrophonePermission(
      participant.permissions?.canPublishSources,
      this.microphoneAllowed,
    );
    this.microphoneAllowed = allowed;

    if (!announce) {
      return;
    }

    logLiveKitDebug("stream-manager", "local-permissions-changed", { allowed });
    this.callbacks.onMicrophonePermissionChanged?.(allowed);

    // The controller compares desired state against what the participant is
    // ACTUALLY publishing, so the revoked side needs no bookkeeping here: the
    // track is gone, the intent is still "on", and that mismatch is exactly what
    // makes this call republish.
    if (republish) {
      void this.reapplyMicrophoneState();
    }
    this.updateMediaMap();
  };

  private readonly handleParticipantConnected = (p: RemoteParticipant) => {
    logLiveKitDebug("stream-manager", "participant-connected", { identity: p.identity });
    // Whole watch state is re-announced for the newcomer's benefit: the data
    // channel has no backlog, so somebody joining after a share started would
    // otherwise see an empty audience until the next time anyone toggled.
    this.screenWatchPresence.onPeerConnected(p.identity);
    this.updateMediaMap();
  };

  private readonly handleParticipantDisconnected = (p: RemoteParticipant) => {
    logLiveKitDebug("stream-manager", "participant-disconnected", { identity: p.identity });
    // Nobody announces that they stopped watching on the way out.
    this.screenWatchPresence.onPeerDisconnected(p.identity);
    this.updateMediaMap();
  };

  private readonly handleDataReceived = (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => {
    this.screenWatchPresence.onData(payload, participant?.identity);
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
