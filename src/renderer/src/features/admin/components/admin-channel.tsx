import { useEffect, useMemo, useState } from "react";
import { MessageOutlined, SoundOutlined, TeamOutlined } from "@ant-design/icons";
import { adminService } from "../services/admin-service";

// A chat channel is stored as "lobby:<room id>" or "dm:<user id>::<user id>",
// which is what the moderation tables used to print. These turn it into what a
// moderator reads: the room's name and kind, or the two people in a private
// conversation.

export interface ChannelInfo {
  kind: "voice" | "text" | "dm" | "unknown";
  title: string;
  detail?: string;
}

export interface AdminRoomOption {
  id: string;
  name: string;
  isTextOnly: boolean;
}

const shortId = (id: string): string => (id.length > 10 ? `${id.slice(0, 8)}…` : id);

const parseDirect = (channel: string): [string, string] | null => {
  if (!channel.startsWith("dm:")) return null;
  const [left, right] = channel.slice(3).split("::");
  return left && right ? [left, right] : null;
};

/**
 * Names for the channels on screen. Rooms are read once; the people in private
 * conversations are looked up as they appear, which is a handful at most
 * (only reported messages ever reach the panel from a private channel).
 */
export function useChannelDirectory(channels: readonly string[]): {
  resolve: (channel: string) => ChannelInfo;
  rooms: AdminRoomOption[];
} {
  const [rooms, setRooms] = useState<AdminRoomOption[] | null>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void adminService
      .listLobbies({ kind: "all", limit: 200 })
      .then((data) => {
        if (!active) return;
        setRooms(
          data.lobbies.map((entry) => ({
            id: entry.lobby.id,
            name: entry.lobby.name,
            isTextOnly: Boolean(entry.lobby.isTextOnly),
          })),
        );
      })
      .catch(() => {
        // Without names the tables still show the rooms' ids; nothing to tell
        // a moderator who came here to read messages.
        if (active) setRooms([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const wantedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const channel of channels) {
      const pair = parseDirect(channel);
      if (pair) {
        ids.add(pair[0]);
        ids.add(pair[1]);
      }
    }
    return [...ids].filter((id) => usernames[id] === undefined).slice(0, 40);
  }, [channels, usernames]);

  useEffect(() => {
    if (wantedIds.length === 0) return;
    let active = true;
    void Promise.all(
      wantedIds.map((id) =>
        adminService
          .getUser(id)
          .then((data) => [id, data.user.username] as const)
          .catch(() => [id, ""] as const),
      ),
    ).then((pairs) => {
      if (!active) return;
      setUsernames((previous) => {
        const next = { ...previous };
        for (const [id, username] of pairs) next[id] = username;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [wantedIds]);

  const byId = useMemo(() => new Map((rooms ?? []).map((room) => [room.id, room])), [rooms]);

  const resolve = (channel: string): ChannelInfo => {
    if (channel.startsWith("lobby:")) {
      const id = channel.slice("lobby:".length);
      const room = byId.get(id);
      if (room) {
        return {
          kind: room.isTextOnly ? "text" : "voice",
          title: room.name,
          detail: room.isTextOnly ? "Yazılı oda" : "Sesli oda",
        };
      }
      // Rooms known and this one not among them: deleted since.
      return rooms !== null
        ? { kind: "unknown", title: "Silinmiş oda", detail: id }
        : { kind: "unknown", title: id };
    }

    const pair = parseDirect(channel);
    if (pair) {
      const name = (id: string): string => (usernames[id] ? `@${usernames[id]}` : shortId(id));
      return { kind: "dm", title: "Özel mesaj", detail: `${name(pair[0])} ↔ ${name(pair[1])}` };
    }

    return { kind: "unknown", title: channel };
  };

  return { resolve, rooms: rooms ?? [] };
}

/** One channel in a table cell: a glyph for its kind, its name, what it is. */
export function ChannelCell({ info }: { info: ChannelInfo }) {
  const icon =
    info.kind === "dm" ? (
      <TeamOutlined />
    ) : info.kind === "text" ? (
      <MessageOutlined />
    ) : (
      <SoundOutlined />
    );
  return (
    <div className="ct-admin-table-user">
      <span className="ct-admin-row-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="ct-admin-person-text">
        <strong>{info.title}</strong>
        {info.detail && <span>{info.detail}</span>}
      </div>
    </div>
  );
}
