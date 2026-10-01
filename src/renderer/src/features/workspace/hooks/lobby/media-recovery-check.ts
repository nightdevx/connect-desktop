// The deferred media check after the network comes back or the machine wakes.
//
// LiveKit resumes its own session, usually within a couple of seconds, and a
// rejoin issued before it finishes replaces a room that was about to recover.
// The SFU logged exactly that, over and over: a successful resume, then one
// second later CLIENT_REQUEST_LEAVE and a brand-new session — a two-second hole
// in everyone's audio, plus a microphone opened again from scratch, for a blip
// LiveKit had already handled. So the media is only rejoined if, once LiveKit
// has had its chance, there is no live session for the room.
//
// Membership is not this check's job: the lobby socket is redialled at once by
// the caller, and the watchdog re-joins if the roster stops listing us.
//
// Pure — timers and state come in through `deps` — so the rules can be checked
// without React or a DOM (scripts/check-media-recovery.cjs).

// How long LiveKit gets before the app looks. LiveKit holds a signal resume for
// at least two seconds by design and a full ICE restart takes a few more; this
// is comfortably past both, and short enough that a session LiveKit has given
// up on is rebuilt well inside the server's 45-second membership TTL.
export const MEDIA_RECOVERY_CHECK_DELAY_MS = 8_000;

export interface MediaRecoveryCheckDeps {
  /** The lobby the user is in right now, or null. Read again when the check fires. */
  activeLobby: () => string | null;
  /**
   * Whether LiveKit still holds a session for this lobby — connected, restoring
   * it by itself, or a connect for it already under way.
   */
  isMediaAlive: (lobbyId: string) => boolean;
  /** Forces the rejoin, through the one reconnect scheduler. */
  rejoin: () => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (handle: number) => void;
  delayMs?: number;
}

export interface MediaRecoveryCheck {
  /**
   * The network came back or the machine woke. Rejoins at once if there is no
   * session left to wait for; otherwise looks again after the delay. A new
   * trigger restarts the wait: LiveKit's own recovery restarts with it.
   */
  schedule: () => void;
  /** Drops a pending check. */
  cancel: () => void;
}

export const createMediaRecoveryCheck = (
  deps: MediaRecoveryCheckDeps,
): MediaRecoveryCheck => {
  let timer: number | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
  };

  const schedule = (): void => {
    cancel();

    const scheduledFor = deps.activeLobby();
    if (!scheduledFor) {
      return;
    }

    // Nothing left to wait for: LiveKit already let go of the session (it gave
    // up while we were offline) or the room never came up. Waiting would only
    // add the delay to a rejoin that is certainly needed.
    if (!deps.isMediaAlive(scheduledFor)) {
      deps.rejoin();
      return;
    }

    timer = deps.setTimer(() => {
      timer = null;
      const lobbyId = deps.activeLobby();
      // Moved or left in the meantime: that room has its own lifecycle.
      if (!lobbyId || lobbyId !== scheduledFor) {
        return;
      }
      if (deps.isMediaAlive(lobbyId)) {
        return;
      }
      deps.rejoin();
    }, deps.delayMs ?? MEDIA_RECOVERY_CHECK_DELAY_MS);
  };

  return { schedule, cancel };
};
