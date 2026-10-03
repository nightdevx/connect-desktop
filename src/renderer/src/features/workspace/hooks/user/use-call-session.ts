import { useEffect, useRef, useState, useCallback } from "react";
import workspaceService from "../../services";
import type { UserDirectoryEntry } from "@shared/auth-contracts";
import { CALL_LOG_BODIES, readMutedCallers, setCallerMuted } from "./call-log";

export type CallStatus = "idle" | "incoming" | "outgoing" | "active";

export interface CallSessionState {
  status: CallStatus;
  callId: string | null;
  callerId: string | null;
  callerName: string | null;
  targetUserId: string | null;
  peerUser: UserDirectoryEntry | null;
  isMuted?: boolean;
  // ISO time the call went active, for the running time on the stage and the
  // dock. A rejoin restarts it: the original start does not survive a leave.
  connectedAt?: string | null;
}

// ongoingCall stores full context needed to rejoin after a soft leave
export interface OngoingCallInfo {
  callId: string;
  peerUser: UserDirectoryEntry;
  callerId: string | null;       // original caller (needed when hard-ending after rejoin)
  targetUserId: string | null;   // original callee
}

const initialCallState: CallSessionState = {
  status: "idle",
  callId: null,
  callerId: null,
  callerName: null,
  targetUserId: null,
  peerUser: null,
  isMuted: false,
};

class CallAudioSynthesizer {
  private audioCtx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  public startRingtone() {
    this.stop();
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext!)();
      const playTone = () => {
        if (!this.audioCtx) return;
        
        // Premium Ringtone: Elegant, soft perfect fourth chord (E4 + A4)
        this.osc1 = this.audioCtx.createOscillator();
        this.osc2 = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();

        this.osc1.type = "sine";
        this.osc1.frequency.value = 329.63; // E4

        this.osc2.type = "sine";
        this.osc2.frequency.value = 440.00; // A4

        // Smooth glassmorphic attack and organic exponential decay envelope
        this.gainNode.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0.06, this.audioCtx.currentTime + 0.2); // Softer volume
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 1.75);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        this.osc1.start();
        this.osc2.start();

        const o1 = this.osc1;
        const o2 = this.osc2;
        const g = this.gainNode;

        setTimeout(() => {
          try {
            o1.stop();
            o2.stop();
            o1.disconnect();
            o2.disconnect();
            g.disconnect();
          } catch {}
        }, 1800);
      };

      playTone();
      this.intervalId = setInterval(playTone, 3000);
    } catch (err) {
      console.error("Synthesizer ringtone error:", err);
    }
  }

  public startDialTone() {
    this.stop();
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext!)();
      const playTone = () => {
        if (!this.audioCtx) return;
        
        // Premium Calling Tone: Warm, harmonic perfect fifth chord (C4 + G4)
        this.osc1 = this.audioCtx.createOscillator();
        this.osc2 = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();

        this.osc1.type = "sine";
        this.osc1.frequency.value = 261.63; // C4 (Middle C)

        this.osc2.type = "sine";
        this.osc2.frequency.value = 392.00; // G4 (Perfect Fifth)

        // Classic double-pulse ("chime-chime... pause") calling cadence with organic decay
        const now = this.audioCtx.currentTime;
        
        // First soft chime pulse
        this.gainNode.gain.setValueAtTime(0.0001, now);
        this.gainNode.gain.linearRampToValueAtTime(0.05, now + 0.1);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        
        // Second soft chime pulse
        this.gainNode.gain.setValueAtTime(0.0001, now + 0.7);
        this.gainNode.gain.linearRampToValueAtTime(0.05, now + 0.8);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        this.osc1.start();
        this.osc2.start();

        const o1 = this.osc1;
        const o2 = this.osc2;
        const g = this.gainNode;

        setTimeout(() => {
          try {
            o1.stop();
            o2.stop();
            o1.disconnect();
            o2.disconnect();
            g.disconnect();
          } catch {}
        }, 1300);
      };

      playTone();
      this.intervalId = setInterval(playTone, 3000);
    } catch (err) {
      console.error("Synthesizer dialtone error:", err);
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    try {
      if (this.osc1) {
        this.osc1.stop();
        this.osc1.disconnect();
        this.osc1 = null;
      }
      if (this.osc2) {
        this.osc2.stop();
        this.osc2.disconnect();
        this.osc2 = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioCtx) {
        if (this.audioCtx.state !== "closed") {
          this.audioCtx.close();
        }
        this.audioCtx = null;
      }
    } catch {
      // Ignored
    }
  }
}

interface UseCallSessionParams {
  currentUserId: string;
  currentUsername: string;
  setActiveLobbyId: (lobbyId: string | null) => void;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
}

export const useCallSession = ({
  currentUserId,
  currentUsername,
  setActiveLobbyId,
  setStatus,
}: UseCallSessionParams) => {
  const [callState, setCallState] = useState<CallSessionState>(initialCallState);
  const [ongoingCall, setOngoingCall] = useState<OngoingCallInfo | null>(null);
  const synthRef = useRef<CallAudioSynthesizer | null>(null);
  const callStateRef = useRef<CallSessionState>(initialCallState);
  const ongoingCallRef = useRef<OngoingCallInfo | null>(null);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    ongoingCallRef.current = ongoingCall;
  }, [ongoingCall]);

  // The rejoin banner lives as long as ongoingCall, and only an incoming signal
  // or our own hang-up clears that. A signal lost while the socket reconnected,
  // a backend restart that forgot the call, or both sides stepping out softly
  // left the banner up for good. While it can show, ask the server every 15 s
  // (and on focus) whether the call is still there: CALL_FORBIDDEN means it
  // ended, and nobody in it twice in a row means it is over in practice.
  const bannerCandidate = ongoingCall !== null && callState.status !== "active";
  useEffect(() => {
    if (!bannerCandidate) {
      return;
    }
    let cancelled = false;
    let emptyReadings = 0;
    const check = async (): Promise<void> => {
      const call = ongoingCallRef.current;
      if (!call) {
        return;
      }
      const result = await workspaceService.getCallPeerStatus({ callId: call.callId });
      if (cancelled || ongoingCallRef.current?.callId !== call.callId) {
        return;
      }
      if (!result.ok) {
        // Anything else (the media server unreachable, the bridge too old) is
        // not an answer, and the banner stays.
        if (result.error?.code === "CALL_FORBIDDEN") {
          setOngoingCall(null);
        }
        return;
      }
      emptyReadings = result.data?.peerConnected ? 0 : emptyReadings + 1;
      if (emptyReadings >= 2) {
        setOngoingCall(null);
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 15_000);
    const onFocus = (): void => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [bannerCandidate]);

  // When a call becomes active, record it in ongoingCall (for rejoin capability)
  useEffect(() => {
    if (callState.status === "active" && callState.callId && callState.peerUser) {
      setOngoingCall({
        callId: callState.callId,
        peerUser: callState.peerUser,
        callerId: callState.callerId,
        targetUserId: callState.targetUserId,
      });
    }
  }, [callState.status, callState.callId, callState.peerUser, callState.callerId, callState.targetUserId]);

  // Lazy instantiating synthesizer
  const getSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new CallAudioSynthesizer();
    }
    return synthRef.current;
  }, []);

  // Cleanup synth on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
        synthRef.current = null;
      }
    };
  }, []);

  const initiateCall = useCallback(async (targetUser: UserDirectoryEntry) => {
    if (callStateRef.current.status !== "idle") {
      setStatus("Zaten aktif bir arama veya oda bağlantınız mevcut.", "warn");
      return;
    }

    try {
      const result = await workspaceService.initiateCall({ targetUserId: targetUser.userId });
      if (!result.ok || !result.data) {
        setStatus(`Arama başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`, "error");
        return;
      }

      const { callId } = result.data;
      setCallState({
        status: "outgoing",
        callId,
        callerId: currentUserId,
        callerName: currentUsername,
        targetUserId: targetUser.userId,
        peerUser: targetUser,
      });

      setActiveLobbyId(`call_${callId}`);
      getSynth().startDialTone();
      setStatus(`${targetUser.displayName} aranıyor...`, "ok");
    } catch (error) {
      // Exception mesajları teknik ve çoğu zaman İngilizce; kullanıcıya sabit
      // bir açıklama, ayrıntı konsola.
      console.error("[call-session] startCall failed:", error);
      setStatus("Arama başlatılamadı. Lütfen tekrar dene.", "error");
    }
  }, [currentUserId, currentUsername, getSynth, setActiveLobbyId, setStatus]);

  const acceptCall = useCallback(async () => {
    const { callId, callerId } = callStateRef.current;
    if (!callId || !callerId) return;

    try {
      getSynth().stop();
      const result = await workspaceService.acceptCall({ callId, callerId });
      if (!result.ok) {
        setStatus(`Arama kabul edilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`, "error");
        setCallState(initialCallState);
        return;
      }

      setCallState((prev) => ({
        ...prev,
        status: "active",
        connectedAt: new Date().toISOString(),
      }));
      setActiveLobbyId(`call_${callId}`);
      setStatus("Arama başladı.", "ok");
    } catch (error) {
      console.error("[call-session] acceptCall failed:", error);
      setStatus("Arama kabul edilemedi. Lütfen tekrar dene.", "error");
      setCallState(initialCallState);
    }
  }, [getSynth, setActiveLobbyId, setStatus]);

  const rejectCall = useCallback(async () => {
    const { callId, callerId } = callStateRef.current;
    if (!callId || !callerId) {
      setCallState(initialCallState);
      return;
    }

    try {
      getSynth().stop();
      await workspaceService.rejectCall({ callId, callerId });
      void workspaceService.sendDirectMessage({
        peerUserId: callerId,
        body: CALL_LOG_BODIES.declined,
      });
    } catch {
      // Ignored
    } finally {
      setCallState(initialCallState);
      setOngoingCall(null);
      setStatus("Arama reddedildi.", "warn");
    }
  }, [getSynth, setStatus]);

  const cancelCall = useCallback(async () => {
    const { callId, targetUserId } = callStateRef.current;
    if (!callId || !targetUserId) {
      setCallState(initialCallState);
      setOngoingCall(null);
      return;
    }

    try {
      getSynth().stop();
      await workspaceService.cancelCall({ callId, targetUserId });
      void workspaceService.sendDirectMessage({
        peerUserId: targetUserId,
        body: CALL_LOG_BODIES.missed,
      });
    } catch {
      // Ignored
    } finally {
      setCallState(initialCallState);
      setOngoingCall(null);
      setStatus("Arama iptal edildi.", "warn");
    }
  }, [getSynth, setStatus]);

  /**
   * endActiveCall — two modes:
   *
   * SOFT LEAVE  (peerInRoom = true):
   *   - Peer is still connected to LiveKit → they can continue alone.
   *   - We disconnect locally and reset callState to "idle".
   *   - We do NOT notify the peer (they stay in the call).
   *   - We KEEP ongoingCall so the local user can rejoin later.
   *
   * HARD END (peerInRoom = false):
   *   - We are the last one in the room (or peer already left).
   *   - Notify peer via cancel/reject signal.
   *   - Write "📞 Arama bitti" DM to chat history.
   *   - Clear ongoingCall — the call is officially over.
   */
  const endActiveCall = useCallback(async (peerInRoom?: boolean) => {
    const { callId, targetUserId, callerId, status } = callStateRef.current;
    // Use ongoingCall as fallback for callerId/targetUserId (needed after rejoin
    // when callState may not have the original caller info).
    const resolvedCallId = callId ?? ongoingCallRef.current?.callId ?? null;
    const resolvedCallerId = callerId ?? ongoingCallRef.current?.callerId ?? null;
    const resolvedTargetUserId = targetUserId ?? ongoingCallRef.current?.targetUserId ?? null;

    getSynth().stop();
    // Always disconnect locally
    setActiveLobbyId(null);
    setCallState(initialCallState);

    const isHardEnd = !peerInRoom;

    if (isHardEnd && resolvedCallId && (status === "active" || status === "outgoing" || status === "incoming")) {
      // Hard end: notify peer and record call end in DM history
      // Hung up before it was answered: the caller leaves a missed call and
      // the callee a declined one, not an "ended" with no start to pair with.
      const body =
        status === "outgoing"
          ? CALL_LOG_BODIES.missed
          : status === "incoming"
            ? CALL_LOG_BODIES.declined
            : CALL_LOG_BODIES.ended;
      try {
        if (currentUserId === resolvedCallerId && resolvedTargetUserId) {
          await workspaceService.cancelCall({ callId: resolvedCallId, targetUserId: resolvedTargetUserId });
          void workspaceService.sendDirectMessage({ peerUserId: resolvedTargetUserId, body });
        } else if (resolvedCallerId) {
          await workspaceService.rejectCall({ callId: resolvedCallId, callerId: resolvedCallerId });
          void workspaceService.sendDirectMessage({ peerUserId: resolvedCallerId, body });
        }
      } catch {
        // Ignored
      }
      // Clear ongoingCall — call is truly over
      setOngoingCall(null);
    }
    // If soft leave (peerInRoom = true): ongoingCall is intentionally kept for rejoin

    setStatus("Arama sonlandırıldı.", "ok");
  }, [currentUserId, getSynth, setActiveLobbyId, setStatus]);

  // Handle incoming real-time signaling signals
  useEffect(() => {
    const unsubscribe = workspaceService.onUserDirectoryEvent(async (event) => {
      // Direct call signal
      if (
        event.type === "incoming-call" ||
        event.type === "call-accepted" ||
        event.type === "call-rejected" ||
        event.type === "call-cancelled"
      ) {
        const { type, callId, callerId, callerName, callerUsername, targetUserId } =
          event.callPayload;

        // The server now delivers call signals only to the two parties, but the
        // client must still confirm the signal is about THIS call. Without the
        // callId comparison below, ending any call cleared the call state of
        // every other client that received the broadcast — an uninvolved user
        // sitting in a lobby was silently ejected from it.
        const concernsUs =
          callerId === currentUserId || targetUserId === currentUserId;
        if (!concernsUs) {
          return;
        }

        // 1. INCOMING CALL
        if (type === "incoming-call") {
          // If we are the caller or not the target user, ignore
          if (callerId === currentUserId || targetUserId !== currentUserId) {
            return;
          }

          // If we are already busy, automatically reject
          if (callStateRef.current.status !== "idle") {
            try {
              await workspaceService.rejectCall({ callId, callerId });
            } catch {}
            return;
          }

          // Fetch peer profile from directory
          let peerUser: UserDirectoryEntry | null = null;
          try {
            const result = await workspaceService.getRegisteredUsers();
            if (result.ok && result.data) {
              peerUser = result.data.users.find((u) => u.userId === callerId) || null;
            }
          } catch {}

          // The directory is friends + self, so a call from someone you are not
          // friends with resolves to nothing there. Everything downstream keys
          // off peerUser — the stage tiles, the dock, the conversation header —
          // so a null one answered into a live call with no hang-up button. The
          // signal already names the caller; only the avatar and the profile
          // fields degrade.
          if (!peerUser) {
            peerUser = {
              userId: callerId,
              // Not callerName: this is the handle the profile card copies and
              // Arkadaş Ekle looks up, and a display name there resolves to
              // nobody. Empty is honest — the same blank a seeded row carries.
              username: callerUsername ?? "",
              displayName: callerName,
              role: "member",
              createdAt: "",
            };
          }

          const isMuted = readMutedCallers().includes(callerId);

          setCallState({
            status: "incoming",
            callId,
            callerId,
            callerName,
            targetUserId,
            peerUser,
            isMuted,
          });

          if (!isMuted) {
            getSynth().startRingtone();
            // A ringtone alone is useless if the app is minimised behind a
            // full-screen game; the toast is what says who is calling.
            void workspaceService.notify({
              kind: "incoming-call",
              title: "Gelen arama",
              body: `${callerName} sizi arıyor`,
              peerUserId: callerId,
            });
          }
          setStatus(`${callerName} sizi arıyor...`, "ok");
        }

        // 2. CALL ACCEPTED
        else if (type === "call-accepted" && callId === callStateRef.current.callId) {
          getSynth().stop();
          setCallState((prev) => ({
            ...prev,
            status: "active",
            connectedAt: new Date().toISOString(),
          }));
          setActiveLobbyId(`call_${callId}`);
          setStatus("Arama kabul edildi.", "ok");
          if (targetUserId) {
            void workspaceService.sendDirectMessage({ peerUserId: targetUserId, body: CALL_LOG_BODIES.started });
          }
        }

        // 3. CALL REJECTED
        // This is a "hard end" signal from the peer — clear everything.
        // Guard: ignore signals WE sent ourselves (targetUserId === currentUserId means we were the rejector)
        else if (type === "call-rejected") {
          if (targetUserId === currentUserId) return; // we sent this, ignore
          // ...and only tear down if it is the call we are actually in. One we
          // stepped out of only loses its "rejoin" banner.
          if (callId !== callStateRef.current.callId) {
            if (callId === ongoingCallRef.current?.callId) {
              setOngoingCall(null);
            }
            return;
          }

          getSynth().stop();
          setCallState(initialCallState);
          setActiveLobbyId(null);
          setOngoingCall(null);
          setStatus("Arama sonlandırıldı.", "warn");
        }

        // 4. CALL CANCELLED
        // This is a "hard end" signal from the peer — clear everything.
        // Guard: ignore signals WE sent ourselves (callerId === currentUserId means we were the canceller)
        else if (type === "call-cancelled") {
          if (callerId === currentUserId) return; // we sent this, ignore
          if (callId !== callStateRef.current.callId) {
            if (callId === ongoingCallRef.current?.callId) {
              setOngoingCall(null);
            }
            return;
          }

          getSynth().stop();
          setCallState(initialCallState);
          setActiveLobbyId(null);
          setOngoingCall(null);
          setStatus("Arama sonlandırıldı.", "warn");
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUserId, getSynth, setActiveLobbyId, setStatus]);

  // Outgoing Call Auto Timeout (30 seconds)
  useEffect(() => {
    if (callState.status === "outgoing") {
      outgoingTimeoutRef.current = setTimeout(() => {
        console.log("[useCallSession] Arama 30 saniye boyunca yanıtlanmadığı için otomatik iptal ediliyor.");
        void cancelCall();
      }, 30000);
    } else {
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current);
        outgoingTimeoutRef.current = null;
      }
    }
    return () => {
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current);
      }
    };
  }, [callState.status, cancelCall]);

  const rejoinCall = useCallback(async () => {
    const active = ongoingCallRef.current;
    if (!active) return;
    // A call that already ended would only fail at the token, with nothing on
    // screen saying why.
    const peer = await workspaceService.getCallPeerStatus({ callId: active.callId });
    if (!peer.ok && peer.error?.code === "CALL_FORBIDDEN") {
      setOngoingCall(null);
      setStatus("Bu görüşme sona ermiş.", "warn");
      return;
    }
    try {
      getSynth().stop();
      setCallState({
        status: "active",
        callId: active.callId,
        callerId: active.callerId,         // restore original caller info
        callerName: null,
        targetUserId: active.targetUserId, // restore original target info
        peerUser: active.peerUser,
        connectedAt: new Date().toISOString(),
      });
      setActiveLobbyId(`call_${active.callId}`);
      setStatus("Aramaya tekrar katıldınız.", "ok");
    } catch (error) {
      console.error("[call-session] rejoinCall failed:", error);
      setStatus("Aramaya katılınamadı. Lütfen tekrar dene.", "error");
    }
  }, [getSynth, setActiveLobbyId, setStatus]);

  // "Bu kişinin aramalarını sessize al", from the ringing card: stop the ring
  // now and for every later call from them. The call itself is left to run out,
  // so the caller sees a missed call rather than a rejection.
  const muteIncomingCaller = useCallback((): void => {
    const { status, callerId, callerName } = callStateRef.current;
    if (status !== "incoming" || !callerId) {
      return;
    }
    setCallerMuted(callerId, true);
    getSynth().stop();
    setCallState((prev) => ({ ...prev, isMuted: true }));
    setStatus(
      `${callerName || "Bu kişi"} sessize alındı; aramaları artık çalmayacak.`,
      "ok",
    );
  }, [getSynth, setStatus]);

  return {
    callState,
    ongoingCall,
    muteIncomingCaller,
    setOngoingCall,
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endActiveCall,
    rejoinCall,
  };
};
