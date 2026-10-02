import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/store/ui-store";
import workspaceService from "../../services";
import {
  createRecoveryTracker,
  isRecoveredBy,
  type RecoveryStream,
  type StreamStatus,
} from "./backend-recovery";

export function useBackendRecovery(enabled: boolean): void {
  const queryClient = useQueryClient();
  const setStatus = useUiStore((state) => state.setStatus);
  // One per stream, so each refreshes what it feeds; and one for the
  // announcement, so three streams coming back together say so once.
  const trackersRef = useRef<Record<RecoveryStream, ReturnType<typeof createRecoveryTracker>>>({
    lobby: createRecoveryTracker(),
    users: createRecoveryTracker(),
    dm: createRecoveryTracker(),
  });
  const announceRef = useRef(createRecoveryTracker());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const trackers = trackersRef.current;

    const onStatus = (stream: RecoveryStream, status: StreamStatus): void => {
      const now = Date.now();
      if (announceRef.current.observe(status, now)) {
        setStatus("Sunucu bağlantısı geri geldi, veriler yenilendi.", "ok");
      }
      if (!trackers[stream].observe(status, now)) {
        return;
      }
      void queryClient.invalidateQueries({
        predicate: (query) => isRecoveredBy(stream, query.queryKey),
      });
    };

    const unsubscribers = [
      workspaceService.onLobbyStreamEvent((event) => {
        if (event.type === "stream-status") {
          onStatus("lobby", event.status);
        }
      }),
      workspaceService.onUserDirectoryEvent((event) => {
        if (event.type === "stream-status") {
          onStatus("users", event.status);
        }
      }),
      workspaceService.onDirectMessagesEvent((event) => {
        if (event.type === "stream-status") {
          onStatus("dm", event.status);
        }
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [enabled, queryClient, setStatus]);
}
