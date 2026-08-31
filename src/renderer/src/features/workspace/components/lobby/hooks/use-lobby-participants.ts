import { useMemo } from "react";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import type { ParticipantMediaMap } from "@/features/livekit";
import { useSpeakingStore } from "@/features/livekit";
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
  const speakingUserIds = useSpeakingStore((state) => state.speakingUserIds);

  const lobbyParticipants = useMemo<LobbyParticipantView[]>(() => {
    // Whether this person is talking right now.
    //
    // ONE source: the media map's isSpeaking, which the stream manager resolves
    // for everybody the same way — measured off their own audio when this client
    // is receiving it, the server's active-speaker flag when it is not, mute-gated
    // and held against the gap between two words in both cases.
    //
    // Deriving it here as well is what made the ring unreliable. This hook used to
    // hold its own copy of the server's speaker list with its own 700ms timers and
    // OR it against the map, so the two disagreed constantly: the map could say
    // "measured silent" while the stale server list still said "speaking", and the
    // OR meant the wrong one always won. The mute gate lived here too, keyed off
    // micEnabled, which LiveKit reports as false when it has no publication yet —
    // so a remote who had just unmuted was silenced by the very check meant to
    // catch a force-mute.
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

      // No media-map entry means this roster member has not reached LiveKit yet,
      // which is the one window the server's list can cover and the map cannot.
      return mapped
        ? speakingUserIds.includes(userId)
        : activeSpeakerIds.includes(userId);
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
    activeSpeakerIds,
    cameraEnabled,
    currentUserId,
    currentUsername,
    headphoneEnabled,
    localFallbackJoinedAt,
    lobbyMembers,
    micEnabled,
    screenEnabled,
    remoteParticipantStreams,
    speakingUserIds,
  ]);

  return { lobbyParticipants };
}
