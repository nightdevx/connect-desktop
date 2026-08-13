import { LocalParticipant, Track } from "livekit-client";
import type { ParticipantMediaMap } from "@/features/livekit";
import type { LobbyParticipantView } from "./lobby-participant-tile";

export type ParticipantSourcePreference = "auto" | "screen" | "camera";
export type StageTileKind = "camera" | "screen" | "avatar";

export interface StageParticipantSlot {
  slotId: string;
  participant: LobbyParticipantView;
  sourcePreference: ParticipantSourcePreference;
  kind: StageTileKind;
}

export function resolveMappedTracks(
  participant: LobbyParticipantView,
  remoteParticipantStreams: ParticipantMediaMap,
) {
  let mappedTracks = remoteParticipantStreams[participant.userId];

  if (!mappedTracks) {
    mappedTracks = remoteParticipantStreams[participant.username];
  }

  if (!mappedTracks) {
    const entry = Object.entries(remoteParticipantStreams).find(([id, state]) => {
      if (participant.isLocalUser && state.participant instanceof LocalParticipant) {
        return true;
      }
      const lowerId = id.toLowerCase();
      const lowerUserId = participant.userId.toLowerCase();
      const lowerUsername = participant.username.toLowerCase();
      return (
        lowerId === lowerUserId ||
        lowerId === lowerUsername ||
        lowerId.includes(lowerUserId) ||
        lowerUserId.includes(lowerId)
      );
    });
    if (entry) {
      mappedTracks = entry[1];
    }
  }

  return mappedTracks;
}

export function resolveSourceStream(
  participant: LobbyParticipantView,
  localCameraStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  remoteParticipantStreams: ParticipantMediaMap,
  source: "screen" | "camera",
): Track | MediaStream | null {
  const mappedTracks = resolveMappedTracks(
    participant,
    remoteParticipantStreams,
  );

  if (source === "screen") {
    if (participant.screenSharing) {
      if (mappedTracks?.screen) return mappedTracks.screen;
      if (participant.isLocalUser) return localScreenStream;
    }
    return null;
  }

  if (participant.cameraEnabled) {
    if (mappedTracks?.camera) return mappedTracks.camera;
    if (participant.isLocalUser) return localCameraStream;
  }

  return null;
}

export function resolvePreviewStream(
  participant: LobbyParticipantView,
  localCameraStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  remoteParticipantStreams: ParticipantMediaMap,
  sourcePreference: ParticipantSourcePreference = "auto",
  cameraHidden = false,
): Track | MediaStream | null {
  if (cameraHidden) {
    // If we only want to hide camera, we still allow screen share
    if (sourcePreference === "screen") {
      return resolveSourceStream(
        participant,
        localCameraStream,
        localScreenStream,
        remoteParticipantStreams,
        "screen",
      );
    }
    
    if (sourcePreference === "camera") return null;
    
    // Auto mode: only allow screen
    return resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "screen",
    );
  }

  if (sourcePreference === "screen") {
    return resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "screen",
    );
  }

  if (sourcePreference === "camera") {
    return resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "camera",
    );
  }

  return (
    resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "screen",
    ) ??
    resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "camera",
    )
  );
}

export function resolveParticipantRenderKey(
  participant: LobbyParticipantView,
  activeLobbyId: string | null,
  sourcePreference: ParticipantSourcePreference,
): string {
  // joinedAt is deliberately NOT part of the key.
  //
  // It used to be, and in a 1:1 call the roster is rebuilt from a useMemo whose
  // deps change up to 10x/second while anyone speaks — each rebuild minting a
  // fresh `new Date().toISOString()`. That made this slotId, and therefore the
  // React key on every participant tile, change at the same rate: React
  // unmounted and remounted every tile ten times a second, detaching the track
  // from one <video> element and attaching it to a brand new one, so the
  // camera and screen-share preview flickered or stayed black for the whole
  // call. lobbyId + userId + source is already unique per tile.
  return `${activeLobbyId ?? "no-lobby"}:${participant.userId}:${sourcePreference}`;
}
