import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { message } from "antd";
import {
  isLobbyTransitionBusy,
  workspaceService,
  type LobbyTransitionState,
} from "@/features/workspace";
import type { LobbyStateMember } from "@shared/desktop-api-types";

// Staying in a room you did not leave.
//
// There are exactly two ways to learn that we are no longer in a room, and they
// answer different questions.
//
//   1. The server tells us, with a reason (`lobby-removed`). Authoritative and
//      immediate — but only deliverable while the socket is alive, which is
//      precisely not the case for a heartbeat timeout.
//   2. We notice we are missing from the roster. Always available, never
//      self-explanatory: a kick and a hiccup look identical.
//
// The old code had only (2) and treated it as (1) — after a few seconds of
// absence it left the room for real and marked the lobby un-rejoinable, so every
// transient became a permanent departure. That is the "people fall out of the
// lobby for no reason" report, and tuning the delay cannot fix it.
//
// Now (1) decides, and (2) recovers: on unexplained absence we re-join rather
// than leave. Re-joining is a no-op for someone who is still a member and is
// refused, with a specific code, exactly when the departure was real.

// Join refusals that mean "you are genuinely not in this room any more".
//
// Anything not listed here — a network failure, a 5xx, LOBBY_FULL, an access
// token that expired mid-refresh — is a failed probe, not a verdict, and must
// leave the user exactly where they are.
const DEPARTURE_MESSAGE_FOR_CODE: Record<string, string> = {
  LOBBY_KICKED: "Odadan atıldınız.",
  LOBBY_BANNED: "Bu odadan yasaklandınız.",
  LOBBY_NOT_FOUND: "Oda kapatıldı.",
  LOBBY_LOCKED: "Odaya erişim izniniz kaldırıldı.",
  LOBBY_PASSWORD_REQUIRED: "Oda şifresi değişti, tekrar katılmanız gerekiyor.",
  LOBBY_PASSWORD_INCORRECT: "Oda şifresi değişti, tekrar katılmanız gerekiyor.",
  LOBBY_TEXT_ONLY: "Oda mesajlaşma odasına dönüştürüldü.",
  FORBIDDEN: "Odaya erişim izniniz kaldırıldı.",
};

// Consecutive absent observations before we challenge the server. Snapshots
// arrive about once a second while the stream is healthy, so this is ~4s of real
// evidence — and zero seconds of evidence when the stream is down, which is the
// point.
const ABSENT_OBSERVATIONS_BEFORE_CHALLENGE = 4;

export interface LobbyMembershipWatchdogOptions {
  activeLobbyId: string | null;
  currentUserId: string;
  /** The websocket roster snapshot, a new object identity per push. */
  lobbyMembersById: Record<string, LobbyStateMember[]>;
  activeLobbyRef: MutableRefObject<string | null>;
  kickedLobbyIdRef: MutableRefObject<string | null>;
  /** The password the user actually entered, so a silent re-join can present it. */
  activeLobbyPasswordRef: MutableRefObject<string | null>;
  lobbyTransitionRef: MutableRefObject<LobbyTransitionState>;
  /** Re-declares mic/camera/screen and brings the media room back up. */
  performPostJoinSyncRef: MutableRefObject<(lobbyId: string) => Promise<void>>;
  leaveActiveLobby: (reason?: "kicked" | "user") => Promise<void> | void;
  /**
   * Follows a moderator's move into the room they put this account in.
   *
   * A ref for the same reason performPostJoinSyncRef is one: the join path is
   * built further down the shell than this hook is called, and re-registering
   * the removal listener on every render of it would drop frames.
   */
  followModeratorMoveRef: MutableRefObject<(lobbyId: string) => void>;
}

export function useLobbyMembershipWatchdog({
  activeLobbyId,
  currentUserId,
  lobbyMembersById,
  activeLobbyRef,
  kickedLobbyIdRef,
  activeLobbyPasswordRef,
  lobbyTransitionRef,
  performPostJoinSyncRef,
  leaveActiveLobby,
  followModeratorMoveRef,
}: LobbyMembershipWatchdogOptions): void {
  const hasSeenActiveLobbyStateRef = useRef<Record<string, boolean>>({});
  const hasSeenCurrentUserInLobbyRef = useRef(false);
  // How many CONSECUTIVE roster observations have failed to list us. Counted in
  // observations, not milliseconds — see the recovery effect at the bottom.
  const absentRosterObservationsRef = useRef(0);
  // The roster object this hook has already judged. lobbyMembersById gets a new
  // identity per push, so comparing references is what makes the effect
  // snapshot-driven instead of render-driven.
  const judgedRosterRef = useRef<unknown>(null);
  const membershipRecoveryInFlightRef = useRef(false);

  const leaveActiveLobbyRef = useRef(leaveActiveLobby);
  useEffect(() => {
    leaveActiveLobbyRef.current = leaveActiveLobby;
  });

  // Changing rooms invalidates every count and flag above; a lobby we are no
  // longer in must not keep a "we have seen its state" mark that would let one
  // stale snapshot eject us from the next room.
  useEffect(() => {
    const activeId = activeLobbyId;
    hasSeenCurrentUserInLobbyRef.current = false;
    absentRosterObservationsRef.current = 0;
    judgedRosterRef.current = null;
    for (const key of Object.keys(hasSeenActiveLobbyStateRef.current)) {
      if (key !== activeId) {
        delete hasSeenActiveLobbyStateRef.current[key];
      }
    }
  }, [activeLobbyId]);

  const departFromLobby = useCallback(
    (lobbyId: string, reason: string): void => {
      // Reset synchronously rather than waiting for the activeLobbyId -> null
      // commit, so a push landing before leaveActiveLobby's REST call resolves
      // cannot re-enter this path.
      hasSeenCurrentUserInLobbyRef.current = false;
      absentRosterObservationsRef.current = 0;
      delete hasSeenActiveLobbyStateRef.current[lobbyId];
      kickedLobbyIdRef.current = lobbyId;
      activeLobbyPasswordRef.current = null;
      message.warning(reason);
      void leaveActiveLobbyRef.current("kicked");
    },
    [activeLobbyPasswordRef, kickedLobbyIdRef],
  );

  const recoverMembership = useCallback(
    (lobbyId: string, why: string): void => {
      if (membershipRecoveryInFlightRef.current) return;
      // A deliberate join/leave is already changing rooms; it owns the outcome.
      if (isLobbyTransitionBusy(lobbyTransitionRef.current)) return;
      membershipRecoveryInFlightRef.current = true;
      console.log(
        `[membership-watchdog] ${why} — re-joining ${lobbyId} to find out why`,
      );

      void workspaceService
        .joinLobby({
          lobbyId,
          password: activeLobbyPasswordRef.current ?? undefined,
        })
        .then(async (result) => {
          // Moved on while the probe was in flight; its answer is about a room
          // the user is no longer standing in.
          if (activeLobbyRef.current !== lobbyId) return;

          if (result.ok) {
            // Back on the roster. Re-declare mic/camera/screen and make sure the
            // media room is up, then say nothing: the user saw no interruption.
            absentRosterObservationsRef.current = 0;
            await performPostJoinSyncRef.current(lobbyId).catch(() => undefined);
            return;
          }

          const departure = DEPARTURE_MESSAGE_FOR_CODE[result.error?.code ?? ""];
          if (departure) {
            departFromLobby(lobbyId, departure);
            return;
          }

          // Inconclusive. Keep the user where they are and try again on the
          // next absent observation.
          absentRosterObservationsRef.current = 0;
        })
        .catch(() => {
          absentRosterObservationsRef.current = 0;
        })
        .finally(() => {
          membershipRecoveryInFlightRef.current = false;
        });
    },
    [
      activeLobbyPasswordRef,
      activeLobbyRef,
      departFromLobby,
      lobbyTransitionRef,
      performPostJoinSyncRef,
    ],
  );

  // (1) The server said so. No waiting, no counting, no inference.
  useEffect(() => {
    return workspaceService.onLobbyStreamEvent((event) => {
      if (event.type !== "lobby-removed") return;

      const lobbyId = activeLobbyRef.current;
      // Only frames about the room we are actually standing in matter. A frame
      // for any other room is either stale or about a session we already left.
      if (!lobbyId || lobbyId !== event.lobbyId) return;

      switch (event.reason) {
        case "kicked":
          departFromLobby(lobbyId, "Odadan atıldınız.");
          return;
        case "banned":
          departFromLobby(lobbyId, "Bu odadan yasaklandınız.");
          return;
        case "lobby-deleted":
          departFromLobby(lobbyId, "Oda kapatıldı.");
          return;
        case "moved": {
          // Joins are exclusive, so OUR OWN room change produces one of these.
          // movedTo is what separates the two cases: if the destination is the
          // room we are switching to (or already in), this frame is describing
          // something we did on purpose. Without the check, two devices signed
          // into one account push each other back and forth forever, each
          // recovery probe undoing the other's join.
          const destination = event.movedTo ?? "";
          if (
            !destination ||
            destination === lobbyId ||
            destination === lobbyTransitionRef.current.joiningLobbyId
          ) {
            return;
          }
          departFromLobby(
            lobbyId,
            "Hesabınız başka bir cihazdan farklı bir odaya katıldı.",
          );
          return;
        }
        case "moved-by-moderator": {
          // Somebody else's decision, and the state behind it has already been
          // made: the server put this account in the destination before sending
          // this. So there is nothing to agree to — the only question is whether
          // the media follows, and if it does not, the user sits in a room the
          // roster says they left.
          const destination = event.movedTo ?? "";
          if (!destination) {
            // Cannot follow what does not say where. Treat it as the removal it
            // literally is rather than staying in a room we are no longer in.
            departFromLobby(lobbyId, "Odadan çıkarıldınız.");
            return;
          }

          message.info(
            `${event.movedBy ?? "Bir yetkili"} sizi başka bir odaya taşıdı.`,
          );
          followModeratorMoveRef.current(destination);
          return;
        }
        case "media-timeout":
        case "heartbeat-timeout":
          // Not a decision — the server lost sight of us. Re-join at once
          // instead of waiting for four absent snapshots to prove it.
          recoverMembership(lobbyId, `server reported ${event.reason}`);
          return;
        default:
          return;
      }
    });
  }, [
    activeLobbyRef,
    departFromLobby,
    followModeratorMoveRef,
    lobbyTransitionRef,
    recoverMembership,
  ]);

  // (2) We noticed. Recovery only — this path can no longer decide to leave.
  //
  // Two rules, both learned the hard way:
  //   * Count OBSERVATIONS, not milliseconds. The old version compared wall
  //     clock inside an effect that re-runs on every render (leaveActiveLobby is
  //     a fresh closure each time, and media stats re-render the shell at ≥1Hz),
  //     so the render loop was the timer. One bad frame plus six seconds of
  //     unrelated renders was enough to eject, even if the stream had gone
  //     silent right after. Silence must not be a kick.
  //   * Only judge a roster once. judgedRosterRef is what makes that true.
  useEffect(() => {
    if (!activeLobbyId || activeLobbyId.startsWith("call_")) return;
    if (judgedRosterRef.current === lobbyMembersById) return;
    judgedRosterRef.current = lobbyMembersById;

    const noteAbsent = (lobbyId: string, why: string): void => {
      absentRosterObservationsRef.current += 1;
      if (
        absentRosterObservationsRef.current < ABSENT_OBSERVATIONS_BEFORE_CHALLENGE
      ) {
        return;
      }
      recoverMembership(lobbyId, why);
    };

    const members = lobbyMembersById[activeLobbyId];
    if (members) {
      hasSeenActiveLobbyStateRef.current[activeLobbyId] = true;

      if (members.some((member) => member.userId === currentUserId)) {
        hasSeenCurrentUserInLobbyRef.current = true;
        absentRosterObservationsRef.current = 0;
        return;
      }

      // An empty roster for a lobby we believe we are sitting in contradicts
      // itself: if everyone else had left we would still be listed. Treat it as
      // a bad frame, not as a removal.
      if (members.length === 0) {
        return;
      }

      // Only meaningful once we have actually been seen in this lobby.
      if (hasSeenCurrentUserInLobbyRef.current) {
        noteAbsent(
          activeLobbyId,
          "Current user missing from the active lobby roster",
        );
      }
      return;
    }

    // The lobby is absent from the snapshot entirely. Same treatment: only after
    // we have seen its state, and only if it stays gone.
    if (hasSeenActiveLobbyStateRef.current[activeLobbyId]) {
      noteAbsent(activeLobbyId, "Active lobby missing from the snapshot");
    }
  }, [activeLobbyId, lobbyMembersById, currentUserId, recoverMembership]);
}
