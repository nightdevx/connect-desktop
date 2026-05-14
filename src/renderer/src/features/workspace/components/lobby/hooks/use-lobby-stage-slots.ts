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
          },
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "camera",
            ),
            participant,
            sourcePreference: "camera",
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
        },
      ];
    });
  }, [activeLobbyId, lobbyParticipants]);

  return { stageParticipantSlots };
}
