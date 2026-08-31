import { useEffect, useRef, useState } from "react";
import {
  EMPTY_MEDIA_STATS,
  LiveKitMediaSession,
  type LiveKitConnectionStatus,
  type MediaStatsSnapshot,
  type LiveKitAudioProcessingPreferences,
  type ParticipantMediaMap,
  type RemoteParticipantAudioPreference,
  type VideoPublishPreferences,
  type ScreenWatcherMap,
} from "../services/stream";
import type { ActiveNoiseSuppressionMode } from "../services/mic";
import { useMediaStatsStore } from "../store/media-stats-store";
import { useScreenWatchersStore } from "../store/screen-watchers-store";
import { useSpeakingStore } from "../store/speaking-store";
import {
  useConnectionQualityStore,
  type ParticipantConnectionQuality,
} from "../store/connection-quality-store";
import { useUiStore } from "@/store/ui-store";

// Deliberately NOT imported from the workspace feature's reconnect hook, which
// is where the full key union lives. The workspace composes livekit, so an
// import the other way is a layer inversion — and a cycle waiting to happen the
// moment either side grows a value import. This hook only ever reports one key,
// so it declares that one. A caller whose function accepts the wider union is
// still assignable here; contravariance works in our favour.
type LiveKitReconnectStatusKey = "livekit";

// Only one reason originates here: the media transport itself dropped. Named
// rather than `string` so the scheduler's accepted set and this call site cannot
// drift apart — a typo used to be a silently dead trigger.
type LiveKitReconnectTrigger = (
  reason: "livekit-disconnected",
  immediate?: boolean,
) => void;

// Per-participant playback preferences survive a restart.
//
// The stream manager already re-applies them across a reconnect, but the map
// lives inside the session object and the session is rebuilt on every mount —
// so "turn that one loud person down to 40%" lasted exactly as long as the app
// did, and every launch handed the whole room back at 100%.
//
// ponytail: localStorage, not the backend. These are one machine's playback
// choices, like the output device beside them in ct.settings.audio; syncing
// them across devices needs a server-side per-user blob that nothing else
// wants yet.
const PARTICIPANT_AUDIO_STORAGE_KEY = "ct.settings.participant-audio";

const clampPercent = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(200, Math.max(0, Math.round(value)))
    : fallback;
};

const readStoredParticipantAudio = (): Record<
  string,
  RemoteParticipantAudioPreference
> => {
  try {
    const raw = localStorage.getItem(PARTICIPANT_AUDIO_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const restored: Record<string, RemoteParticipantAudioPreference> = {};

    // Rebuilt field by field rather than trusted wholesale: this is parsed
    // input, and a volumePercent of NaN reaches a GainNode as an exception that
    // takes the whole audio pipeline down.
    for (const [userId, value] of Object.entries(parsed)) {
      if (!userId || typeof value !== "object" || value === null) {
        continue;
      }
      const entry = value as Partial<RemoteParticipantAudioPreference>;
      restored[userId] = {
        muted: entry.muted === true,
        volumePercent: clampPercent(entry.volumePercent, 100),
        cameraHidden: entry.cameraHidden === true,
        screenAudioMuted: entry.screenAudioMuted === true,
        screenAudioVolumePercent: clampPercent(
          entry.screenAudioVolumePercent,
          100,
        ),
        emoteMuted: entry.emoteMuted === true,
      };
    }

    return restored;
  } catch {
    return {};
  }
};

// Everything at its default is not worth a row: a lobby the user never touched
// would otherwise grow the blob by one entry per person they have ever sat with.
//
// EVERY field of RemoteParticipantAudioPreference has to be tested here, and
// every field has to be rebuilt in readStoredParticipantAudio above.
//
// emoteMuted was in neither. Silencing a person's soundboard therefore counted
// as "no preference at all": the row was dropped on the way out, and would have
// been dropped again on the way back in. The mute held for the rest of the
// session and was silently gone at the next launch — which is what was reported
// as "muting their emotes does nothing". check-participant-audio.cjs now fails
// if a field is added to the type and missed in either half.
const isDefaultPreference = (
  preference: RemoteParticipantAudioPreference,
): boolean =>
  !preference.muted &&
  preference.volumePercent === 100 &&
  !preference.cameraHidden &&
  !preference.screenAudioMuted &&
  (preference.screenAudioVolumePercent ?? 100) === 100 &&
  !preference.emoteMuted;

const saveStoredParticipantAudio = (
  preferences: Record<string, RemoteParticipantAudioPreference>,
): void => {
  try {
    const persistable = Object.fromEntries(
      Object.entries(preferences).filter(
        ([, preference]) => !isDefaultPreference(preference),
      ),
    );
    localStorage.setItem(
      PARTICIPANT_AUDIO_STORAGE_KEY,
      JSON.stringify(persistable),
    );
  } catch {
    // A full or unavailable quota costs the user a remembered slider, nothing
    // more — never the session.
  }
};

export function useLivekitSession(
  _currentUserId: string,
  // The livekit-owned subset, not the workspace's AudioPreferences: this feature
  // must not import the one that composes it. The caller passes a superset,
  // which is assignable, and the six fields this actually reads are named here
  // rather than left as `any` for the reader to reverse-engineer.
  audioPreferences: LiveKitAudioProcessingPreferences,
  shouldEmitReconnectStatus: (
    key: LiveKitReconnectStatusKey,
    cooldownMs: number,
  ) => boolean,
  activeLobbyRef: React.MutableRefObject<string | null>,
  scheduleActiveLobbyReconnect: LiveKitReconnectTrigger,
  kickedLobbyIdRef: React.MutableRefObject<string | null>,
  videoPreferences: VideoPublishPreferences,
) {
  const setStatus = useUiStore((state) => state.setStatus);
  const [remoteParticipantStreams, setRemoteParticipantStreams] =
    useState<ParticipantMediaMap>({});
  const [
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
  ] = useState<Record<string, RemoteParticipantAudioPreference>>(
    readStoredParticipantAudio,
  );
  const [activeNoiseSuppressionMode, setActiveNoiseSuppressionMode] =
    useState<ActiveNoiseSuppressionMode>("none");
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [liveKitConnectionState, setLiveKitConnectionState] =
    useState<LiveKitConnectionStatus>("disconnected");
  const liveKitSessionRef = useRef<LiveKitMediaSession | null>(null);
  const remoteParticipantAudioPreferencesRef = useRef<
    Record<string, RemoteParticipantAudioPreference>
  >({});
  // The two halves of "who is talking", kept as refs because either callback
  // can fire on its own and the answer needs both.
  const remoteStreamsRef = useRef<ParticipantMediaMap>({});
  const activeSpeakersRef = useRef<string[]>([]);
  const measuredSpeakingRef = useRef<string[]>([]);

  useEffect(() => {
    remoteParticipantAudioPreferencesRef.current =
      remoteParticipantAudioPreferences;
    saveStoredParticipantAudio(remoteParticipantAudioPreferences);
  }, [remoteParticipantAudioPreferences]);

  // Stable initialization of the session
  useEffect(() => {
    // The same answer the stage's own tiles arrive at, published once for
    // everything that draws a ring somewhere else (the sidebar roster).
    //
    // Measured audio first, the server's list only for people this client is
    // not receiving at all — deafened, or not yet subscribed — because that is
    // the one window where there is nothing local to measure. Exactly the rule
    // useLobbyParticipants applies per tile; it lives here as well so the two
    // surfaces cannot start disagreeing about who is talking.
    const publishSpeakingUserIds = (): void => {
      const streams = remoteStreamsRef.current;
      const speaking = new Set<string>(measuredSpeakingRef.current);

      for (const userId of activeSpeakersRef.current) {
        if (!streams[userId]) {
          speaking.add(userId);
        }
      }

      useSpeakingStore
        .getState()
        .setSpeakingUserIds([...speaking].sort());
    };

    const session = new LiveKitMediaSession({
      onRemoteStreamsChanged: (nextStreams: ParticipantMediaMap) => {
        remoteStreamsRef.current = nextStreams;
        setRemoteParticipantStreams(nextStreams);
        publishSpeakingUserIds();
      },
      onSpeakingChanged: (identities: string[]) => {
        measuredSpeakingRef.current = identities;
        publishSpeakingUserIds();
      },
      onActiveSpeakersChanged: (speakerIds: string[]) => {
        // A new array only when the SET of speakers actually changed. LiveKit
        // re-emits this on the server's speaker update — repeatedly, for the
        // whole time one person keeps talking — and each emission used to hand
        // React a fresh array identity, re-rendering the entire workspace shell
        // and every panel under it for a list that had not changed.
        //
        // Sorted first, because LiveKit orders that list by audio level: with two
        // people talking the same two ids arrive in a different order every few
        // hundred milliseconds, which an index-by-index comparison reads as a
        // change. Nothing downstream cares about the order — every consumer asks
        // whether one id is present.
        const sorted = [...speakerIds].sort();
        activeSpeakersRef.current = sorted;
        setActiveSpeakerIds((previous) =>
          previous.length === sorted.length &&
          previous.every((id, index) => id === sorted[index])
            ? previous
            : sorted,
        );
        publishSpeakingUserIds();
      },
      onConnectionStateChanged: (state: LiveKitConnectionStatus) => {
        setLiveKitConnectionState(state);

        // Ended by the server. Stop here — the reconnect chain would either
        // fail repeatedly or, for a duplicate identity, evict the very session
        // it just created and loop. The manager has already explained which
        // decision it was through onWarning; do not overwrite that with a
        // vaguer message.
        if (state === "closed") {
          return;
        }

        if (state === "reconnecting") {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus("LiveKit bağlantısı yeniden kuruluyor...", "warn");
          }
          return;
        }

        if (state === "disconnected" && activeLobbyRef.current) {
          // A server-enforced kick also disconnects LiveKit. Don't claim
          // we're "reconnecting" (we're not — the reconnect loop itself
          // refuses to rejoin a lobby the user was just kicked from).
          if (kickedLobbyIdRef.current === activeLobbyRef.current) {
            return;
          }

          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus(
              "Canlı ses bağlantısı koptu, LiveKit yeniden bağlanmayı deniyor...",
              "warn",
            );
          }
          // Trigger the active-lobby reconnect chain (fresh token + reconnect).
          // The stream manager tears down the dead room on unexpected disconnect,
          // so performPostJoinSynchronization -> connect() will rebuild it.
          scheduleActiveLobbyReconnect("livekit-disconnected", true);
        }
      },
      onWarning: (message: string) => setStatus(message, "warn"),
      // A moderator mute is the one thing that silences someone without their
      // own client knowing. The session republishes the microphone by itself
      // when the grant comes back; this is only so the person is told, in both
      // directions — being inaudible with your own mic button showing "on" and
      // no explanation is what sent people out of the room and back in.
      onMicrophonePermissionChanged: (allowed: boolean) => {
        setStatus(
          allowed
            ? "Mikrofon kısıtlamanız kaldırıldı."
            : "Bir yetkili mikrofonunuzu kapattı.",
          allowed ? "ok" : "warn",
        );
      },
      onNoiseSuppressionModeChanged: (mode: ActiveNoiseSuppressionMode) => {
        setActiveNoiseSuppressionMode(mode);
      },
      // Straight into the store, not React state: this fires once a second for
      // the whole time the user is in a room, and only the connection card and
      // the two panels behind it read a single number out of it.
      onMediaStats: (snapshot: MediaStatsSnapshot) => {
        useMediaStatsStore.getState().setSnapshot(snapshot);
      },
      // Same reasoning, different shape: only the badge on a share tile and
      // the cue that reacts to it care who is watching.
      onScreenWatchersChanged: (watchers: ScreenWatcherMap) => {
        useScreenWatchersStore.getState().setWatchers(watchers);
      },
      onConnectionQualityChanged: (identity: string, quality: string) => {
        useConnectionQualityStore
          .getState()
          .setQuality(identity, quality as ParticipantConnectionQuality);
      },
    });

    liveKitSessionRef.current = session;

    session.setVideoPublishPreferences(videoPreferences);

    // Apply any current audio preferences immediately
    session.setAudioProcessingPreferences({
      enhancedNoiseSuppressionEnabled:
        audioPreferences.enhancedNoiseSuppressionEnabled,
      echoCancellationEnabled: audioPreferences.echoCancellationEnabled,
      noiseSuppressionPreset: audioPreferences.noiseSuppressionPreset,
      selectedAudioInputDeviceId: audioPreferences.selectedAudioInputDeviceId,
      selectedAudioOutputDeviceId: audioPreferences.selectedAudioOutputDeviceId,
      masterVolume: audioPreferences.masterVolume,
      microphoneVolume: audioPreferences.microphoneVolume,
    });

    // The expensive, room-independent half of the microphone chain: an
    // AudioContext, two AudioWorklet modules and the RNNoise WASM. Doing it here
    // takes it off the join path entirely — it used to run after room.connect()
    // resolved, which is the window where you can hear everyone and nobody can
    // hear you. Fire-and-forget: a failure falls back to the browser filters and
    // the publish path retries it anyway.
    void session.warmUpMicrophoneChain();

    // Hand the restored (or, if this is a re-created session, the current)
    // per-participant choices to the fresh session. Without this the manager's
    // own map starts empty and the first person to publish audio comes in at
    // 100% no matter what the menu shows.
    for (const [participantUserId, preference] of Object.entries(
      remoteParticipantAudioPreferencesRef.current,
    )) {
      session.setRemoteParticipantAudioPreference(participantUserId, preference);
    }

    return () => {
      liveKitSessionRef.current = null;
      setActiveSpeakerIds([]);
      remoteStreamsRef.current = {};
      activeSpeakersRef.current = [];
      measuredSpeakingRef.current = [];
      useMediaStatsStore.getState().setSnapshot(EMPTY_MEDIA_STATS);
      useScreenWatchersStore.getState().setWatchers({});
      useSpeakingStore.getState().setSpeakingUserIds([]);
      useConnectionQualityStore.getState().reset();
      void session.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setStatus,
    shouldEmitReconnectStatus,
    activeLobbyRef,
    scheduleActiveLobbyReconnect,
    kickedLobbyIdRef,
  ]);

  // Codec / hardware preference changes apply to the next publish, so this can
  // safely run without recreating the session.
  useEffect(() => {
    liveKitSessionRef.current?.setVideoPublishPreferences(videoPreferences);
    // The two fields, not the object: the caller builds it with useMemo but the
    // whole point is that only a codec or hardware change matters here, and a
    // fresh object identity must not push preferences the SFU already has.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoPreferences.codec, videoPreferences.hardwareAcceleration]);

  // Sync preferences without recreating the session
  useEffect(() => {
    if (liveKitSessionRef.current) {
      liveKitSessionRef.current.setAudioProcessingPreferences({
        enhancedNoiseSuppressionEnabled:
          audioPreferences.enhancedNoiseSuppressionEnabled,
        echoCancellationEnabled: audioPreferences.echoCancellationEnabled,
        noiseSuppressionPreset: audioPreferences.noiseSuppressionPreset,
        selectedAudioInputDeviceId: audioPreferences.selectedAudioInputDeviceId,
        selectedAudioOutputDeviceId:
          audioPreferences.selectedAudioOutputDeviceId,
        masterVolume: audioPreferences.masterVolume,
        microphoneVolume: audioPreferences.microphoneVolume,
      });
    }
  }, [
    audioPreferences.enhancedNoiseSuppressionEnabled,
    audioPreferences.echoCancellationEnabled,
    audioPreferences.noiseSuppressionPreset,
    audioPreferences.selectedAudioInputDeviceId,
    audioPreferences.selectedAudioOutputDeviceId,
    audioPreferences.masterVolume,
    audioPreferences.microphoneVolume,
  ]);

  return {
    liveKitSessionRef,
    remoteParticipantStreams,
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
    activeNoiseSuppressionMode,
    remoteParticipantAudioPreferencesRef,
    activeSpeakerIds,
    liveKitConnectionState,
  };
}
