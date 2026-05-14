import { useMemo } from "react";
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
  const activeSpeakerLookup = useMemo(() => {
    const list = activeSpeakerIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    return {
      list,
      set: new Set(list),
    };
  }, [activeSpeakerIds]);

  const lobbyParticipants = useMemo<LobbyParticipantView[]>(() => {
    // DEBUG LOG
    console.log("[LobbyGlowDebug] Recalculating lobbyParticipants", {
      currentUserId,
      currentUsername,
      activeSpeakerIds,
      streamMapKeys: Object.keys(remoteParticipantStreams)
    });

    const merged = lobbyMembers.map((member) => {
      const isActiveSpeaker =
        activeSpeakerLookup.set.has(member.userId) ||
        activeSpeakerLookup.set.has(member.username) ||
        activeSpeakerLookup.list.some((id) => {
          const lowerId = id.toLowerCase();
          const lowerUserId = member.userId.toLowerCase();
          const lowerUsername = member.username.toLowerCase();
          return (
            lowerId === lowerUserId ||
            lowerId === lowerUsername ||
            lowerId.includes(lowerUserId) ||
            lowerUserId.includes(lowerId)
          );
        });

      const isLocal = member.userId === currentUserId;
      const mappedTracks = resolveMappedTracks(
        { ...member, isLocalUser: isLocal } as any,
        remoteParticipantStreams,
      );
      const isActuallySpeaking =
        isActiveSpeaker || mappedTracks?.isSpeaking || (mappedTracks?.audioLevel && mappedTracks.audioLevel > 0.01) || false;
      const speaking = isActuallySpeaking || (member.speaking && !member.muted);

      if (!isLocal) {
        return {
          ...member,
          speaking,
          isLocalUser: false,
        };
      }

      const localMuted = !micEnabled;
      const localSpeaking =
        (isActiveSpeaker || mappedTracks?.isSpeaking || (mappedTracks?.audioLevel && mappedTracks.audioLevel > 0.01) || false) && !localMuted;

      return {
        ...member,
        muted: localMuted,
        deafened: !headphoneEnabled,
        speaking: localSpeaking,
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
      const localActiveSpeaker =
        activeSpeakerLookup.set.has(currentUserId) ||
        activeSpeakerLookup.set.has(currentUsername) ||
        activeSpeakerLookup.list.some((id) => {
          const lowerId = id.toLowerCase();
          const lowerUserId = currentUserId.toLowerCase();
          const lowerUsername = currentUsername.toLowerCase();
          return (
            lowerId === lowerUserId ||
            lowerId === lowerUsername ||
            lowerId.includes(lowerUserId) ||
            lowerUserId.includes(lowerId)
          );
        });
      const localMappedTracks = resolveMappedTracks(
        {
          userId: currentUserId,
          username: currentUsername,
          isLocalUser: true,
        } as any,
        remoteParticipantStreams,
      );
      const isActuallySpeaking =
        localActiveSpeaker || localMappedTracks?.isSpeaking || (localMappedTracks?.audioLevel && localMappedTracks.audioLevel > 0.01) || false;

      merged.unshift({
        userId: currentUserId,
        username: currentUsername,
        joinedAt: localFallbackJoinedAt,
        muted: localMuted,
        deafened: !headphoneEnabled,
        speaking: isActuallySpeaking && !localMuted,
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      });
    }

    return merged.sort((left, right) => {
      if (left.isLocalUser !== right.isLocalUser) {
        return left.isLocalUser ? -1 : 1;
      }

      if (left.speaking !== right.speaking) {
        return left.speaking ? -1 : 1;
      }

      return left.username.localeCompare(right.username, "tr");
    });
  }, [
    activeLobbyId,
    activeSpeakerLookup,
    cameraEnabled,
    currentUserId,
    currentUsername,
    headphoneEnabled,
    localFallbackJoinedAt,
    lobbyMembers,
    micEnabled,
    screenEnabled,
    remoteParticipantStreams,
    activeSpeakerIds,
  ]);

  return {
    activeSpeakerLookup,
    lobbyParticipants,
  };
}
