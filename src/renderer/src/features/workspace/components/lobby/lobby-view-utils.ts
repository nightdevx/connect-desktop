import type { Track } from "livekit-client";
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

// The media map is keyed by LiveKit identity, and the identity IS the account id:
// the token is minted with SetIdentity(user.ID) in the backend's media handler,
// and the lobby roster is keyed the same way. So an exact lookup is the whole
// mapping.
//
// This used to fall back to case-insensitive SUBSTRING matching in both
// directions — `id.includes(userId) || userId.includes(id)` — over every entry in
// the map. That is not a lax version of the right answer, it is a different
// answer: it can attach one participant's tracks, speaking state and audio level
// to a different person's tile, and the loop's first match wins, so which person
// depends on insertion order. Nothing produced the keys it was meant to rescue.
export function resolveMappedTracks(
  participant: LobbyParticipantView,
  remoteParticipantStreams: ParticipantMediaMap,
) {
  const mapped = remoteParticipantStreams[participant.userId];
  if (mapped) {
    return mapped;
  }

  // The one genuine exception: the local roster entry can be a client-side
  // placeholder built before the server confirmed the join, so the local
  // participant is worth finding by flag rather than by key.
  //
  // `isLocal`, not `instanceof LocalParticipant`: an instanceof check compares
  // against one module instance, and two copies of livekit-client in a bundle make
  // it answer false for a genuine LocalParticipant with nothing to show for it.
  if (participant.isLocalUser) {
    return Object.values(remoteParticipantStreams).find(
      (state) => state.participant.isLocal,
    );
  }

  return undefined;
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
