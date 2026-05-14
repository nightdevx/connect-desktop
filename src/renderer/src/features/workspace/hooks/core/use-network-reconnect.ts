import { useEffect, useRef, useState, useCallback } from "react";
import { useUiStore } from "@/store/ui-store";

export type ReconnectStatusKey = "network" | "lobbyStream" | "activeLobby" | "livekit";
const RECONNECT_JITTER_MAX_MS = 450;

export const withReconnectJitter = (delayMs: number): number => {
  return delayMs + Math.floor(Math.random() * RECONNECT_JITTER_MAX_MS);
};

export const isBrowserOnline = (): boolean => {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
};

export function useNetworkReconnect() {
  const setStatus = useUiStore((state) => state.setStatus);
  const [isOnline, setIsOnline] = useState(isBrowserOnline());
  const onlineRef = useRef(isOnline);
  const reconnectStatusAtRef = useRef<Record<ReconnectStatusKey, number>>({
    network: 0,
    lobbyStream: 0,
    activeLobby: 0,
    livekit: 0,
  });

  const shouldEmitReconnectStatus = useCallback(
    (key: ReconnectStatusKey, cooldownMs: number): boolean => {
      const now = Date.now();
      const previous = reconnectStatusAtRef.current[key];
      if (now - previous < cooldownMs) {
        return false;
      }
      reconnectStatusAtRef.current[key] = now;
      return true;
    },
    [],
  );

  useEffect(() => {
    const handleOnline = (): void => {
      if (onlineRef.current) return;
      onlineRef.current = true;
      setIsOnline(true);
      // specific logic can be observed by the caller
    };

    const handleOffline = (): void => {
      if (!onlineRef.current) return;
      onlineRef.current = false;
      setIsOnline(false);
      if (shouldEmitReconnectStatus("network", 4_000)) {
        setStatus(
          "İnternet bağlantısı kesildi. Bağlantı geri geldiğinde otomatik yeniden denenecek.",
          "warn",
        );
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setStatus, shouldEmitReconnectStatus]);

  return {
    isOnline,
    shouldEmitReconnectStatus,
  };
}



