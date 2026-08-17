import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { type LobbyStateMember } from "@shared/desktop-api-types";
import { type LiveKitMediaSession } from "@/features/livekit";
import { soundEffectManager } from "@/features/sound-effects";
import workspaceService from "../../services";
import { readAudioPreferences } from "../../workspace-media-utils";

// Re-assert cadence for the drift watchdog. Comfortably longer than the
// server's mutedDeclarationTTL (12s) so a correction and the reconciler can
// never ping-pong.
const AUDIO_REASSERT_INTERVAL_MS = 15_000;

interface UseAudioControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<Pick<LobbyStateMember, "muted" | "deafened">>
  ) => void;
}

export const useAudioControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  setStatus,
  patchLobbyMemberState,
}: UseAudioControlsParams) => {
  const [micEnabled, setMicEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultMicEnabled
  );
  const [headphoneEnabled, setHeadphoneEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultHeadphoneEnabled
  );

  // 0. Continuous state synchronization with the active LiveKit session
  useEffect(() => {
    if (liveKitSessionRef.current) {
      void liveKitSessionRef.current.setMicrophoneEnabled(micEnabled);
      liveKitSessionRef.current.setDeafened(!headphoneEnabled);
    }
  }, [liveKitSessionRef, micEnabled, headphoneEnabled]);

  // declareAudioState pushes BOTH flags, always.
  //
  // It used to send only the non-default half ("if muted, say muted"), which
  // meant a rejoin could never correct the server back to unmuted/undeafened:
  // whatever stale value was left on the roster from the previous session
  // survived, and everyone else kept rendering it.
  const declareAudioState = useCallback(
    async (lobbyId: string, mic: boolean, headphones: boolean): Promise<void> => {
      if (lobbyId.startsWith("call_")) {
        // 1:1 call rooms have no lobby state to declare against.
        return;
      }

      const [muteResult, deafenResult] = await Promise.all([
        workspaceService.setLobbyMuted({ lobbyId, muted: !mic }),
        workspaceService.setLobbyDeafened({ lobbyId, deafened: !headphones }),
      ]);

      if (!muteResult.ok) {
        setStatus(
          `Mikrofon durumu uygulanamadi: ${muteResult.error?.message ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }
      if (!deafenResult.ok) {
        setStatus(
          `Kulaklik durumu uygulanamadi: ${deafenResult.error?.message ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }
    },
    [setStatus],
  );

  const syncLobbyAudioState = useCallback(
    async (lobbyId: string): Promise<void> => {
      // Ensure the LiveKit session reflects the current UI state immediately.
      liveKitSessionRef.current?.setDeafened(!headphoneEnabled);
      void liveKitSessionRef.current?.setMicrophoneEnabled(micEnabled);

      await declareAudioState(lobbyId, micEnabled, headphoneEnabled);
    },
    [micEnabled, headphoneEnabled, liveKitSessionRef, declareAudioState],
  );

  // Drift watchdog.
  //
  // Everything above is fire-and-forget over HTTP: a declaration can be lost to
  // a dropped request, a server restart, or a reconcile pass that ran while the
  // room was mid-reconnect. The local user's own tile always renders local
  // state, so a disagreement is invisible to the person causing it and shows up
  // only on everyone else's screen — which is exactly the reported bug.
  //
  // So compare what the roster says about US with what we believe, and re-send
  // if they differ. Throttled, because the roster arrives about once a second.
  const lastReassertAtRef = useRef(0);
  const reconcileDeclaredAudioState = useCallback(
    (serverMuted: boolean | undefined, serverDeafened: boolean | undefined): void => {
      const lobbyId = activeLobbyRef.current;
      if (!lobbyId || lobbyId.startsWith("call_")) {
        return;
      }
      if (serverMuted === undefined && serverDeafened === undefined) {
        return;
      }

      const agrees =
        serverMuted === !micEnabled && serverDeafened === !headphoneEnabled;
      if (agrees) {
        return;
      }

      const now = Date.now();
      // Longer than the server's own mutedDeclarationTTL, so a re-assert cannot
      // fight the reconciler in a loop.
      if (now - lastReassertAtRef.current < AUDIO_REASSERT_INTERVAL_MS) {
        return;
      }
      lastReassertAtRef.current = now;

      void declareAudioState(lobbyId, micEnabled, headphoneEnabled);
    },
    [activeLobbyRef, micEnabled, headphoneEnabled, declareAudioState],
  );

  // The side effects run OUTSIDE the state updater.
  //
  // React treats updaters as pure and re-invokes them freely; StrictMode does so
  // on every call in development. With the sound, the query-cache write and the
  // REST call inside, one click on the mic button played the toggle twice,
  // wrote the cache twice and sent two setLobbyMuted requests that could land
  // out of order — leaving the server roster showing the opposite of the UI.
  const applyMicState = useCallback(
    (next: boolean): void => {
      soundEffectManager.playMicToggle(next);

      const activeLobbyId = activeLobbyRef.current;
      if (!activeLobbyId) {
        return;
      }

      patchLobbyMemberState(currentUserId, { muted: !next });

      void liveKitSessionRef.current
        ?.setMicrophoneEnabled(next)
        .catch((error: unknown) => {
          setStatus(
            `Mikrofon yayini guncellenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
            "warn"
          );
        });

      if (!activeLobbyId.startsWith("call_")) {
        void workspaceService
          .setLobbyMuted({ lobbyId: activeLobbyId, muted: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Mikrofon durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn"
              );
            }
          });
      }
    },
    [activeLobbyRef, currentUserId, liveKitSessionRef, patchLobbyMemberState, setStatus]
  );

  const handleMicToggle = useCallback((): void => {
    const next = !micEnabled;
    setMicEnabled(next);
    applyMicState(next);
  }, [micEnabled, applyMicState]);

  // Absolute set rather than a toggle. Push-to-talk needs it: a key-repeat or a
  // missed keyup must never leave the mic in the opposite state to the key.
  const setMicState = useCallback(
    (next: boolean): void => {
      if (next === micEnabled) {
        return;
      }
      setMicEnabled(next);
      applyMicState(next);
    },
    [micEnabled, applyMicState],
  );

  const handleHeadphoneToggle = useCallback((): void => {
    const next = !headphoneEnabled;
    setHeadphoneEnabled(next);

    soundEffectManager.playHeadphoneToggle(next);

    // LiveKit sync: when deafened (next=false), silence all remote audio.
    liveKitSessionRef.current?.setDeafened(!next);

    // Deafening also mutes the mic. Set it directly instead of scheduling
    // handleMicToggle on a timeout — the old version read a `micEnabled` that
    // could already be stale by the time the callback ran.
    if (!next && micEnabled) {
      setMicEnabled(false);
      applyMicState(false);
    }

    const activeLobbyId = activeLobbyRef.current;
    if (!activeLobbyId) {
      return;
    }

    patchLobbyMemberState(currentUserId, { deafened: !next });

    if (!activeLobbyId.startsWith("call_")) {
      void workspaceService
        .setLobbyDeafened({ lobbyId: activeLobbyId, deafened: !next })
        .then((result) => {
          if (!result.ok) {
            setStatus(
              `Kulaklik durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn"
            );
          }
        });
    }
  }, [
    activeLobbyRef,
    currentUserId,
    patchLobbyMemberState,
    setStatus,
    liveKitSessionRef,
    micEnabled,
    headphoneEnabled,
    applyMicState,
  ]);

  return {
    micEnabled,
    setMicEnabled,
    headphoneEnabled,
    setHeadphoneEnabled,
    handleMicToggle,
    setMicState,
    handleHeadphoneToggle,
    syncLobbyAudioState,
    reconcileDeclaredAudioState,
  };
};




