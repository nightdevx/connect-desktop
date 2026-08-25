import { useCallback, useEffect, useRef, useState } from "react";
import { emptyMusicState, type MusicState } from "@shared/music";
import { musicService } from "./music-service";

interface MusicRoom {
  state: MusicState;
  isDj: boolean;
  available: boolean;
  isSending: boolean;
  lastReply: string;
  lastError: string;
  send: (command: string) => Promise<boolean>;
}

const errorMessage = (error?: { code: string; message: string }): string => {
  if (!error) {
    return "Müzik komutu gönderilemedi.";
  }
  if (error.code === "MUSIC_DISABLED") {
    return "Müzik botu bu sunucuda kapalı.";
  }
  return error.message;
};

export function useMusicRoom(lobbyId: string | null): MusicRoom {
  const [state, setState] = useState<MusicState>(() => emptyMusicState(lobbyId ?? ""));
  const [isDj, setIsDj] = useState(false);
  const [available, setAvailable] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastReply, setLastReply] = useState("");
  const [lastError, setLastError] = useState("");

  const revisionRef = useRef(-1);
  const lobbyIdRef = useRef(lobbyId);
  lobbyIdRef.current = lobbyId;

  const applyState = useCallback((next: MusicState) => {
    if (next.revision < revisionRef.current) {
      return;
    }
    revisionRef.current = next.revision;
    setState(next);
  }, []);

  useEffect(() => {
    revisionRef.current = -1;
    setLastReply("");
    setLastError("");
    setState(emptyMusicState(lobbyId ?? ""));

    if (!lobbyId) {
      setAvailable(false);
      setIsDj(false);
      return;
    }

    let cancelled = false;
    void musicService.getState(lobbyId).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok || !result.data) {
        setAvailable(false);
        setIsDj(false);
        return;
      }
      setAvailable(result.data.state.enabled);
      setIsDj(result.data.isDj);
      applyState(result.data.state);
    });

    return () => {
      cancelled = true;
    };
  }, [applyState, lobbyId]);

  useEffect(() => {
    return musicService.onStateEvent((event) => {
      if (!lobbyIdRef.current || event.lobbyId !== lobbyIdRef.current) {
        return;
      }
      applyState(event.state);
    });
  }, [applyState]);

  const send = useCallback(
    async (command: string): Promise<boolean> => {
      const target = lobbyIdRef.current;
      const trimmed = command.trim();
      if (!target || trimmed === "") {
        return false;
      }

      setIsSending(true);
      try {
        const result = await musicService.sendCommand(target, trimmed);
        if (!result.ok || !result.data) {
          setLastError(errorMessage(result.error));
          setLastReply("");
          return false;
        }

        setLastError("");
        setLastReply(result.data.reply);
        setIsDj(result.data.isDj);
        setAvailable(result.data.state.enabled);
        applyState(result.data.state);
        return true;
      } finally {
        setIsSending(false);
      }
    },
    [applyState],
  );

  return { state, isDj, available, isSending, lastReply, lastError, send };
}
