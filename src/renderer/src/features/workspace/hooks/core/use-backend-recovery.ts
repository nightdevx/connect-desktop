import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/store/ui-store";
import workspaceService from "../../services";
import { createRecoveryTracker, type StreamStatus } from "./backend-recovery";

export function useBackendRecovery(enabled: boolean): void {
  const queryClient = useQueryClient();
  const setStatus = useUiStore((state) => state.setStatus);
  const trackerRef = useRef(createRecoveryTracker());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tracker = trackerRef.current;

    const onStatus = (status: StreamStatus): void => {
      if (!tracker.observe(status, Date.now())) {
        return;
      }

      void queryClient.invalidateQueries();
      setStatus("Sunucu bağlantısı geri geldi, veriler yenilendi.", "ok");
    };

    const unsubscribers = [
      workspaceService.onLobbyStreamEvent((event) => {
        if (event.type === "stream-status") {
          onStatus(event.status);
        }
      }),
      workspaceService.onUserDirectoryEvent((event) => {
        if (event.type === "stream-status") {
          onStatus(event.status);
        }
      }),
      workspaceService.onDirectMessagesEvent((event) => {
        if (event.type === "stream-status") {
          onStatus(event.status);
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
