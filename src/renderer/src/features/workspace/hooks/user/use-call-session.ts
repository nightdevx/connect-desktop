import { useEffect, useRef, useState, useCallback } from "react";
import workspaceService from "../../services";
import type { UserDirectoryEntry } from "@shared/auth-contracts";

export type CallStatus = "idle" | "incoming" | "outgoing" | "active";

export interface CallSessionState {
  status: CallStatus;
  callId: string | null;
  callerId: string | null;
  callerName: string | null;
  targetUserId: string | null;
  peerUser: UserDirectoryEntry | null;
  isMuted?: boolean;
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
  private intervalId: any = null;

  public startRingtone() {
    this.stop();
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          } catch (e) {}
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
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          } catch (e) {}
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
    } catch (e) {
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
  const outgoingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    ongoingCallRef.current = ongoingCall;
  }, [ongoingCall]);

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
      setStatus(`Arama hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "error");
    }
  }, [currentUserId, currentUsername, getSynth, setActiveLobbyId, setStatus]);

  const acceptCall = useCallback(async () => {
    const { callId, callerId, peerUser } = callStateRef.current;
    if (!callId || !callerId) return;

    try {
      getSynth().stop();
      const result = await workspaceService.acceptCall({ callId, callerId });
      if (!result.ok) {
        setStatus(`Arama kabul edilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`, "error");
        setCallState(initialCallState);
        return;
      }

      setCallState((prev) => ({ ...prev, status: "active" }));
      setActiveLobbyId(`call_${callId}`);
      setStatus("Arama başladı.", "ok");
    } catch (error) {
      setStatus(`Arama kabul hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "error");
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
    } catch (e) {
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
    } catch (e) {
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
      try {
        if (currentUserId === resolvedCallerId && resolvedTargetUserId) {
          await workspaceService.cancelCall({ callId: resolvedCallId, targetUserId: resolvedTargetUserId });
          void workspaceService.sendDirectMessage({ peerUserId: resolvedTargetUserId, body: "📞 Arama bitti" });
        } else if (resolvedCallerId) {
          await workspaceService.rejectCall({ callId: resolvedCallId, callerId: resolvedCallerId });
          void workspaceService.sendDirectMessage({ peerUserId: resolvedCallerId, body: "📞 Arama bitti" });
        }
      } catch (e) {
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
        const { type, callId, callerId, callerName, targetUserId } = event.callPayload;

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
            } catch (e) {}
            return;
          }

          // Fetch peer profile from directory
          let peerUser: UserDirectoryEntry | null = null;
          try {
            const result = await workspaceService.getRegisteredUsers();
            if (result.ok && result.data) {
              peerUser = result.data.users.find((u) => u.userId === callerId) || null;
            }
          } catch (e) {}

          // Check if muted in local storage
          let isMuted = false;
          try {
            const mutedUsersStr = localStorage.getItem("connect_muted_call_users") || "[]";
            const mutedIds = JSON.parse(mutedUsersStr);
            if (Array.isArray(mutedIds) && mutedIds.includes(callerId)) {
              isMuted = true;
            }
          } catch (e) {}

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
          }
          setStatus(`${callerName} sizi arıyor...`, "ok");
        }

        // 2. CALL ACCEPTED
        else if (type === "call-accepted" && callId === callStateRef.current.callId) {
          getSynth().stop();
          setCallState((prev) => ({ ...prev, status: "active" }));
          setActiveLobbyId(`call_${callId}`);
          setStatus("Arama kabul edildi.", "ok");
          if (targetUserId) {
            void workspaceService.sendDirectMessage({ peerUserId: targetUserId, body: "📞 Arama başladı" });
          }
        }

        // 3. CALL REJECTED
        // This is a "hard end" signal from the peer — clear everything.
        // Guard: ignore signals WE sent ourselves (targetUserId === currentUserId means we were the rejector)
        else if (type === "call-rejected") {
          if (targetUserId === currentUserId) return; // we sent this, ignore

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
    try {
      getSynth().stop();
      setCallState({
        status: "active",
        callId: active.callId,
        callerId: active.callerId,         // restore original caller info
        callerName: null,
        targetUserId: active.targetUserId, // restore original target info
        peerUser: active.peerUser,
      });
      setActiveLobbyId(`call_${active.callId}`);
      setStatus("Aramaya tekrar katıldınız.", "ok");
    } catch (error) {
      setStatus(`Aramaya katılma hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "error");
    }
  }, [getSynth, setActiveLobbyId, setStatus]);

  return {
    callState,
    ongoingCall,
    setOngoingCall,
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endActiveCall,
    rejoinCall,
  };
};
