import { useMemo } from "react";
import type { LobbyParticipantView } from "../lobby-participant-tile";
import {
  type StageParticipantSlot,
  resolveParticipantRenderKey,
} from "../lobby-view-utils";

interface UseLobbyStageSlotsProps {
  lobbyParticipants: LobbyParticipantView[];
  activeLobbyId: string | null;
}

export function useLobbyStageSlots({
  lobbyParticipants,
  activeLobbyId,
}: UseLobbyStageSlotsProps) {
  const stageParticipantSlots = useMemo<StageParticipantSlot[]>(() => {
    return lobbyParticipants.flatMap((participant): StageParticipantSlot[] => {
      if (participant.cameraEnabled && participant.screenSharing) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "screen",
            ),
            participant,
            sourcePreference: "screen",
            kind: "screen",
          },
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "camera",
            ),
            participant,
            sourcePreference: "camera",
            kind: "camera",
          },
        ];
      }

      if (participant.screenSharing) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "screen",
            ),
            participant,
            sourcePreference: "screen",
            kind: "screen",
          },
        ];
      }

      if (participant.cameraEnabled) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "camera",
            ),
            participant,
            sourcePreference: "camera",
            kind: "camera",
          },
        ];
      }

      return [
        {
          slotId: resolveParticipantRenderKey(
            participant,
            activeLobbyId,
            "auto",
          ),
          participant,
          sourcePreference: "auto",
          kind: "avatar",
        },
      ];
    });
  }, [activeLobbyId, lobbyParticipants]);

  return { stageParticipantSlots };
}
