// The room list behind a v2 lobby stream (?proto=2, the backend's
// internal/lobby/snapshot_delta.go), kept where the socket is.
//
// v2 sends the rooms that changed, numbered, and a socket that reconnects with
// since=<last seq> is sent only what it missed. The page still gets what it
// always got, the whole list as a lobbies-snapshot: every lobby listener reads
// a snapshot as the full set, and keeping the list here leaves all of them as
// they are. What v2 saves is the server's bytes and the reconnect, not the
// port's.
//
// Pure and electron-free, so the self-check drives it directly.

import type { Bound, ContractDrift } from "../../shared/api-contracts";
import type * as Lobby from "../../shared/generated/lobby";

export interface LobbyRoom {
  id: string;
  name?: string;
  createdAt?: string;
}

interface ListFrame {
  type: string;
  seq?: unknown;
  lobbies?: unknown;
  removed?: unknown;
  at?: unknown;
}
// Every key read here is one the backend's frames carry (shared/api-contracts.ts).
type _ListFrameDelta = Bound<ContractDrift<ListFrame, Lobby.LobbyDeltaFrame>>;
type _ListFrameSnapshot = Bound<ContractDrift<Omit<ListFrame, "removed">, Lobby.LobbiesSnapshotFrame>>;

const isDefaultLobby = (room: LobbyRoom): boolean =>
  room.id === "main-lobby" ||
  (room.name ?? "").trim().toLocaleLowerCase("tr-TR") === "ana lobi";

// The server's own order (listedBefore in internal/lobby/rooms.go): the default
// room, then createdAt, then id. v2 leaves ordering to the client.
export const compareLobbies = (left: LobbyRoom, right: LobbyRoom): number => {
  const leftDefault = isDefaultLobby(left);
  if (leftDefault !== isDefaultLobby(right)) {
    return leftDefault ? -1 : 1;
  }
  const leftAt = left.createdAt ?? "";
  const rightAt = right.createdAt ?? "";
  if (leftAt !== rightAt) {
    return leftAt < rightAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

const roomsOf = (value: unknown): LobbyRoom[] =>
  Array.isArray(value)
    ? value.filter((room): room is LobbyRoom => typeof room?.id === "string")
    : [];

export class LobbyList {
  // The last seq applied, the since= of the next connect. null: no v2 list
  // yet, so the next connect asks for a full snapshot.
  public seq: number | null = null;
  private readonly rooms = new Map<string, LobbyRoom>();

  /**
   * Applies one frame. Returns the full list as the page's lobbies-snapshot,
   * or "resync" for a delta with nothing to apply it to (the caller drops the
   * socket and reconnects without since, which gets a full snapshot).
   */
  public apply(frame: ListFrame): Record<string, unknown> | "resync" {
    if (frame.type === "lobbies-snapshot") {
      this.rooms.clear();
      for (const room of roomsOf(frame.lobbies)) {
        this.rooms.set(room.id, room);
      }
      // A v1 snapshot carries no seq: nothing to resume from.
      this.seq = typeof frame.seq === "number" ? frame.seq : null;
      return this.snapshot(frame.at);
    }

    if (this.seq === null) {
      return "resync";
    }
    for (const room of roomsOf(frame.lobbies)) {
      this.rooms.set(room.id, room);
    }
    if (Array.isArray(frame.removed)) {
      for (const id of frame.removed) {
        this.rooms.delete(String(id));
      }
    }
    if (typeof frame.seq === "number") {
      this.seq = frame.seq;
    }
    return this.snapshot(frame.at);
  }

  /** Whether a list has been received, so a page joining the socket can be handed it. */
  public get known(): boolean {
    return this.seq !== null;
  }

  public snapshot(at?: unknown): Record<string, unknown> {
    return {
      type: "lobbies-snapshot",
      lobbies: [...this.rooms.values()].sort(compareLobbies),
      at: typeof at === "string" ? at : new Date().toISOString(),
    };
  }
}
