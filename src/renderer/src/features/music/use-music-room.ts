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

// What the server's music errors mean, said as a sentence to the person who
// typed. The server's own text is terse ("kaynak çözümlenemedi"); the codes
// below are internal/music's. Anything else keeps the server's words, with a
// capital letter.
const MUSIC_ERRORS: Record<string, string> = {
  MUSIC_DISABLED: "Müzik botu bu sunucuda kapalı.",
  MUSIC_UNAVAILABLE: "Müzik botu şu an kullanılamıyor. Biraz sonra yeniden dene.",
  MUSIC_NOT_A_MEMBER: "Müzik çalmak için önce odaya katıl.",
  MUSIC_NOT_A_DJ: "Müziği yönetmek için DJ yetkin yok. Yetkiyi yöneticiler verir.",
  MUSIC_ADMIN_ONLY: "Bu komutu yalnız yöneticiler kullanabilir.",
  MUSIC_EMPTY_QUERY: "Bir bağlantı yapıştır ya da şarkı adı yaz.",
  MUSIC_EMPTY_COMMAND: "Bir bağlantı yapıştır ya da şarkı adı yaz.",
  MUSIC_QUERY_TOO_LONG: "Yazdığın metin çok uzun. Kısaltıp yeniden dene.",
  MUSIC_INVALID_QUERY: "Yazdığın metinde kullanılamayan bir karakter var.",
  MUSIC_INVALID_URL: "Bu bağlantı açılamadı. Bağlantıyı kontrol et.",
  MUSIC_UNSUPPORTED_SCHEME: "Yalnız http ya da https ile başlayan bağlantılar çalınabilir.",
  MUSIC_HOST_NOT_ALLOWED: "Yalnız YouTube ve Spotify bağlantıları çalınabilir.",
  MUSIC_SPOTIFY_DISABLED: "Spotify bağlantıları bu sunucuda kapalı. YouTube bağlantısı ya da şarkı adı dene.",
  MUSIC_SOURCE_DISABLED: "Bu kaynaktan bağlantılar bu sunucuda kapalı.",
  MUSIC_RESOLVE_FAILED: "Bu bağlantıda ya da aramada çalınabilecek bir parça bulunamadı. Başka bir bağlantı ya da ad dene.",
  MUSIC_NOT_FOUND: "Bu bağlantıda çalınabilecek bir parça bulunamadı.",
  MUSIC_NOTHING_PLAYING: "Şu an çalan bir parça yok.",
  MUSIC_BAD_POSITION: "Sırada o numarada bir parça yok.",
  MUSIC_TOO_MANY_PLAYERS: "Şu an çok sayıda odada müzik çalıyor. Biraz sonra yeniden dene.",
};

/** The server's lower-case phrase as a sentence: capital first letter. */
export const musicSentence = (text: string): string =>
  text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);

const errorMessage = (error?: { code: string; message: string }): string => {
  if (!error) {
    return "Müzik komutu gönderilemedi.";
  }
  return MUSIC_ERRORS[error.code] ?? musicSentence(error.message);
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
