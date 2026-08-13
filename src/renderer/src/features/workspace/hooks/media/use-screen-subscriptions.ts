import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import type { LiveKitMediaSession } from "@/features/livekit";

interface UseScreenSubscriptionsParams {
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  activeLobbyId: string | null;
}

export interface ScreenSubscriptionsState {
  watchedScreenUserIds: string[];
  isWatchingScreen: (userId: string) => boolean;
  watchScreen: (userId: string) => void;
  stopWatchingScreen: (userId: string) => void;
}

/**
 * Which screen shares this user has chosen to watch.
 *
 * Screen video used to be subscribed automatically the moment anyone published
 * it: one person sharing pushed a full video stream to every member of the
 * room, forever, with no way to decline — the single most expensive thing in
 * the app, opted into on someone else's behalf. Now nothing is subscribed until
 * the viewer presses "watch", and stopping actually unsubscribes at the SFU
 * rather than merely hiding a stream that is still being delivered.
 *
 * The set is mirrored in React state purely so tiles re-render; the LiveKit
 * session owns the real subscription state and survives reconnects.
 */
export const useScreenSubscriptions = ({
  liveKitSessionRef,
  activeLobbyId,
}: UseScreenSubscriptionsParams): ScreenSubscriptionsState => {
  const [watchedScreenUserIds, setWatchedScreenUserIds] = useState<string[]>([]);

  // Leaving a room ends every subscription with it; carrying them into the next
  // room would auto-watch a stranger's stream.
  useEffect(() => {
    setWatchedScreenUserIds([]);
  }, [activeLobbyId]);

  const watchScreen = useCallback(
    (userId: string): void => {
      const normalized = userId.trim();
      if (!normalized) {
        return;
      }

      liveKitSessionRef.current?.setScreenSubscription(normalized, true);
      setWatchedScreenUserIds((previous) =>
        previous.includes(normalized) ? previous : [...previous, normalized],
      );
    },
    [liveKitSessionRef],
  );

  const stopWatchingScreen = useCallback(
    (userId: string): void => {
      const normalized = userId.trim();
      if (!normalized) {
        return;
      }

      liveKitSessionRef.current?.setScreenSubscription(normalized, false);
      setWatchedScreenUserIds((previous) =>
        previous.filter((id) => id !== normalized),
      );
    },
    [liveKitSessionRef],
  );

  const isWatchingScreen = useCallback(
    (userId: string): boolean => watchedScreenUserIds.includes(userId),
    [watchedScreenUserIds],
  );

  return {
    watchedScreenUserIds,
    isWatchingScreen,
    watchScreen,
    stopWatchingScreen,
  };
};
