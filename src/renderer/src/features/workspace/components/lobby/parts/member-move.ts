import type { LobbyDescriptor } from "@shared/auth-contracts";

/**
 * Moving a member into another room, from either of the two places a moderator
 * can reach one: the right-click menu, and dragging the row onto a lobby.
 *
 * The two entry points have to agree on exactly one thing — which rooms are a
 * legal destination — so that lives here rather than being filtered twice.
 */
export interface MoveTarget {
  id: string;
  name: string;
}

/**
 * The rooms a member may be carried into.
 *
 * A text room is never one: nobody is ever "in" one, so moving somebody there
 * would take them out of voice and put them nowhere. Neither is the room they
 * are already standing in. The server refuses both anyway; this is what stops
 * the UI offering a click that can only fail.
 */
export const buildMoveTargets = (
  lobbies: LobbyDescriptor[],
  sourceLobbyId: string,
): MoveTarget[] =>
  lobbies
    .filter((lobby) => !lobby.isTextOnly && lobby.id !== sourceLobbyId)
    .map((lobby) => ({ id: lobby.id, name: lobby.name }));

/** The drag payload's MIME type. Custom, so nothing else on the page claims it. */
export const MEMBER_DRAG_TYPE = "application/x-connect-lobby-member";

export interface MemberDragPayload {
  userId: string;
  username: string;
  sourceLobbyId: string;
}

export const encodeMemberDrag = (payload: MemberDragPayload): string =>
  JSON.stringify(payload);

/**
 * Reads a drop back into a payload, or null.
 *
 * Everything is checked because a drop is untrusted input in the ordinary way:
 * the drag can start anywhere, including outside the app, and a half-formed
 * payload here would become a move request with an empty user id. null means
 * "not one of ours", which every drop handler treats as no drop at all.
 */
export const decodeMemberDrag = (raw: string): MemberDragPayload | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const { userId, username, sourceLobbyId } = parsed as Record<string, unknown>;
    if (
      typeof userId !== "string" ||
      typeof sourceLobbyId !== "string" ||
      !userId.trim() ||
      !sourceLobbyId.trim()
    ) {
      return null;
    }

    return {
      userId,
      username: typeof username === "string" ? username : userId,
      sourceLobbyId,
    };
  } catch {
    return null;
  }
};

/**
 * Whether dropping this drag on this room is a move worth making.
 *
 * The same rule as buildMoveTargets, phrased for a drop: the row underneath has
 * to be a different, non-text room. Used to decide whether to light the row up
 * at all, so a room that cannot accept the drop never pretends it can.
 */
export const canDropMemberOn = (
  payload: MemberDragPayload | null,
  lobby: Pick<LobbyDescriptor, "id" | "isTextOnly">,
): boolean =>
  !!payload && !lobby.isTextOnly && payload.sourceLobbyId !== lobby.id;
