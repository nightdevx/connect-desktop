import { useEffect, useMemo, useRef, useState } from "react";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import type { ParticipantMediaMap } from "@/features/livekit";
import type { LobbyParticipantView } from "../lobby-participant-tile";
import { resolveMappedTracks } from "../lobby-view-utils";

interface UseLobbyParticipantsProps {
  lobbyMembers: LobbyStateMember[];
  currentUserId: string;
  currentUsername: string;
  activeLobbyId: string | null;
  activeSpeakerIds: string[];
  remoteParticipantStreams: ParticipantMediaMap;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  localFallbackJoinedAt: string;
}

// How long a speaker stays lit after the last report that they are talking.
//
// The LiveKit server recomputes active speakers on an interval (~400ms) and drops
// anyone below its threshold, so the raw signal goes quiet in the gap between two
// words. Rendering it directly makes the ring strobe while somebody talks
// normally, which reads as broken rather than as accurate.
const SPEAKING_HOLD_MS = 700;

const EMPTY_SPEAKERS: ReadonlySet<string> = new Set();

/**
 * The speaker set with a hangover, so the indicator tracks "is talking" rather
 * than "was above the threshold in the last server tick".
 *
 * Turning ON is immediate — a delay there is the one thing a speaking indicator
 * cannot afford.
 */
function useHeldSpeakers(speakerIds: string[]): ReadonlySet<string> {
  const [held, setHeld] = useState<ReadonlySet<string>>(EMPTY_SPEAKERS);
  // Mirrored so the effect below can read the current set without depending on
  // it, which would re-run the effect on its own output.
  const heldRef = useRef(held);
  const timersRef = useRef(new Map<string, number>());

  useEffect(() => {
    heldRef.current = held;
  }, [held]);

  useEffect(() => {
    const timers = timersRef.current;
    const active = new Set(speakerIds);
    const next = new Set(heldRef.current);

    for (const id of active) {
      const pendingRemoval = timers.get(id);
      if (pendingRemoval !== undefined) {
        window.clearTimeout(pendingRemoval);
        timers.delete(id);
      }
      next.add(id);
    }

    for (const id of next) {
      if (active.has(id) || timers.has(id)) {
        continue;
      }
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id);
          setHeld((previous) => {
            if (!previous.has(id)) {
              return previous;
            }
            const reduced = new Set(previous);
            reduced.delete(id);
            return reduced;
          });
        }, SPEAKING_HOLD_MS),
      );
    }

    // Only additions happen here; removals are the timeouts above. So a size
    // change is exactly "somebody started talking".
    if (next.size !== heldRef.current.size) {
      heldRef.current = next;
      setHeld(next);
    }
  }, [speakerIds]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    },
    [],
  );

  return held;
}

export function useLobbyParticipants({
  lobbyMembers,
  currentUserId,
  currentUsername,
  activeLobbyId,
  activeSpeakerIds,
  remoteParticipantStreams,
  micEnabled,
  headphoneEnabled,
  cameraEnabled,
  screenEnabled,
  localFallbackJoinedAt,
}: UseLobbyParticipantsProps) {
  const heldSpeakers = useHeldSpeakers(activeSpeakerIds);

  const lobbyParticipants = useMemo<LobbyParticipantView[]>(() => {
    // Whether this person is talking right now.
    //
    // Two sources, and only two: the room's active-speaker list (held, above) and
    // LiveKit's own isSpeaking flag on the participant, which is set from the same
    // server updates and is the authority for anyone whose audio this client has
    // not subscribed to.
    //
    // audioLevel is deliberately NOT one of them. It used to be, as
    // `audioLevel > 0.01`, and that was the bug: LiveKit only writes a
    // participant's level when the server mentions them in a speaker update, so
    // the last value a speaker was reported with stays on the object after they go
    // quiet. Any level above a hundredth then lit the ring permanently — and since
    // the threshold is far below what the server itself calls speech, it lit for
    // room noise too. A level is for a volume meter; it cannot answer a yes/no.
    const isSpeakingNow = (
      userId: string,
      locallyMuted: boolean,
      mapped: ParticipantMediaMap[string] | undefined,
    ): boolean => {
      // Only meaningful for the local tile: the toolbar flips before LiveKit has
      // finished unpublishing, and your own ring should go out on the click.
      if (locallyMuted) {
        return false;
      }

      // A microphone that is off — by choice or by a moderator's force-mute —
      // publishes nothing, so a speaking flag from the moment before it went off
      // must not outlive it. Read from LiveKit's publication state rather than from
      // the roster's `muted`, which is what a client last announced.
      if (mapped && !mapped.micEnabled) {
        return false;
      }

      return heldSpeakers.has(userId) || Boolean(mapped?.isSpeaking);
    };

    const merged = lobbyMembers.map((member) => {
      const isLocal = member.userId === currentUserId;
      const mapped = resolveMappedTracks(
        { ...member, isLocalUser: isLocal } as LobbyParticipantView,
        remoteParticipantStreams,
      );

      if (!isLocal) {
        return {
          ...member,
          speaking: isSpeakingNow(member.userId, false, mapped),
          isLocalUser: false,
        };
      }

      const localMuted = !micEnabled;
      return {
        ...member,
        muted: localMuted,
        deafened: !headphoneEnabled,
        speaking: isSpeakingNow(member.userId, localMuted, mapped),
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      };
    });

    if (
      !merged.some((member) => member.userId === currentUserId) &&
      activeLobbyId
    ) {
      const localMuted = !micEnabled;
      const mapped = resolveMappedTracks(
        {
          userId: currentUserId,
          username: currentUsername,
          isLocalUser: true,
        } as LobbyParticipantView,
        remoteParticipantStreams,
      );

      merged.unshift({
        userId: currentUserId,
        username: currentUsername,
        joinedAt: localFallbackJoinedAt,
        muted: localMuted,
        serverMuted: false,
        deafened: !headphoneEnabled,
        speaking: isSpeakingNow(currentUserId, localMuted, mapped),
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      });
    }

    return merged.sort((left, right) => {
      if (left.isLocalUser !== right.isLocalUser) {
        return left.isLocalUser ? -1 : 1;
      }

      // Screen-sharers stay on top so the shared content is easy to find; not
      // sorted by speaking anymore, so tiles don't jump around mid-conversation
      // (speaking is already shown via the tile's border glow).
      if (left.screenSharing !== right.screenSharing) {
        return left.screenSharing ? -1 : 1;
      }

      return left.username.localeCompare(right.username, "tr");
    });
  }, [
    activeLobbyId,
    cameraEnabled,
    currentUserId,
    currentUsername,
    headphoneEnabled,
    heldSpeakers,
    localFallbackJoinedAt,
    lobbyMembers,
    micEnabled,
    screenEnabled,
    remoteParticipantStreams,
  ]);

  return { lobbyParticipants };
}
