import { useEffect, type MutableRefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { CUSTOM_EMOTE_PREFIX } from "@shared/desktop-api-types";
import { playCustomEmote, workspaceService } from "@/features/workspace";
import { soundEffectManager } from "@/features/sound-effects";

/**
 * Plays sound emotes for the room the user is in.
 *
 * Mounted at the shell rather than inside the lobby panel, which unmounts
 * whenever the user looks at Arkadaşlar or Ayarlar — the room is still there and
 * so is the noise.
 *
 * The sender's own emote is played from here too. It arrives on the same frame
 * as everyone else's, which is what makes hearing it a real confirmation that
 * the room heard it, rather than a local sound that plays whether or not the
 * message went anywhere.
 */
export function useLobbyEmotePlayback(
  activeLobbyRef: MutableRefObject<string | null>,
  queryClient: QueryClient,
): void {
  useEffect(() => {
    return workspaceService.onLobbyStreamEvent((event) => {
      if (event.type !== "lobby-emote") return;
      if (!activeLobbyRef.current || activeLobbyRef.current !== event.lobbyId) {
        return;
      }
      // A built-in id is synthesised; an upload is fetched once and cached, by
      // the query client and again as a decoded buffer.
      if (event.emote.startsWith(CUSTOM_EMOTE_PREFIX)) {
        void playCustomEmote(queryClient, event.emote);
        return;
      }

      soundEffectManager.playEmote(event.emote);
    });
  }, [activeLobbyRef, queryClient]);
}
