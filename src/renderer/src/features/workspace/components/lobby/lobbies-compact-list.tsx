import { Tooltip } from "antd";
import type { CSSProperties } from "react";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import { getDisplayInitials, hueStyle } from "../../workspace-utils";
import { Icon } from "../odak/odak-parts";
import { OdakMenu } from "@/ui/odak-menu";
import { RoomMenuHeader, buildRoomMenu } from "./parts/room-menu";

interface LobbiesCompactListProps {
  lobbies: LobbyDescriptor[];
  lobbyMembersById: Record<string, LobbyStateMember[]>;
  activeLobbyId: string | null;
  openTextRoomId: string | null;
  joiningLobbyId: string | null;
  renamingLobbyId: string | null;
  deletingLobbyId: string | null;
  unreadByLobbyId?: Record<string, number>;
  /** The room menu's "Okundu işaretle". */
  onMarkLobbyRead?: (lobbyId: string) => void;
  onJoinLobby: (lobbyId: string) => void;
  /** Opens the sidebar's "Yeni Lobi Oluştur" modal. */
  onCreateLobby?: () => void;
  isCreatingLobby?: boolean;
}

/**
 * The lobby list when the sidebar is folded to a strip: one badge per room, so
 * a wider stage does not cost the way into another room. Voice rooms first,
 * then message rooms, as in the full list. A click does what the full row's
 * click does; settings and the roster need the full sidebar. The "+" at the
 * foot opens the same create modal as the open sidebar's header. Right-click
 * gives the room menu everybody gets; its settings and deletion live with the
 * open sidebar's windows, so they are offered there.
 */
export function LobbiesCompactList({
  lobbies,
  lobbyMembersById,
  activeLobbyId,
  openTextRoomId,
  joiningLobbyId,
  renamingLobbyId,
  deletingLobbyId,
  unreadByLobbyId = {},
  onMarkLobbyRead,
  onJoinLobby,
  onCreateLobby,
  isCreatingLobby = false,
}: LobbiesCompactListProps) {
  const voiceRooms = lobbies.filter((lobby) => !lobby.isTextOnly);
  const textRooms = lobbies.filter((lobby) => lobby.isTextOnly);

  // `order` staggers the badges in as the strip opens, top to bottom.
  const renderRoom = (lobby: LobbyDescriptor, order: number) => {
    const isDisplayed = openTextRoomId
      ? openTextRoomId === lobby.id
      : activeLobbyId === lobby.id;
    const isJoined = activeLobbyId === lobby.id;
    const isDisabled =
      renamingLobbyId === lobby.id ||
      deletingLobbyId === lobby.id ||
      joiningLobbyId !== null;
    const members = lobbyMembersById[lobby.id] ?? [];
    const seatCount = members.length;
    const isLive = members.some((member) => member.screenSharing);
    const unreadCount = unreadByLobbyId[lobby.id] ?? 0;
    const label = lobby.isTextOnly
      ? `# ${lobby.name}`
      : `${lobby.name} · ${seatCount} kişi`;

    const join = (): void => {
      if (!isDisabled && !isDisplayed) {
        onJoinLobby(lobby.id);
      }
    };

    return (
      <li key={lobby.id}>
        <OdakMenu
          trigger="contextMenu"
          header={<RoomMenuHeader lobby={lobby} seatCount={seatCount} />}
          items={buildRoomMenu({
            lobby,
            isDisplayed,
            isJoined,
            busy: isDisabled ? "bekle" : undefined,
            onJoin: join,
            onMarkRead:
              unreadCount > 0 && onMarkLobbyRead
                ? () => onMarkLobbyRead(lobby.id)
                : undefined,
          })}
        >
        <Tooltip title={label} placement="right">
          <button
            type="button"
            className={[
              "ct-lobby-mini",
              lobby.isTextOnly ? "text-room" : "",
              isDisplayed ? "active" : "",
              isJoined ? "joined" : "",
              isDisabled ? "busy" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              { ...hueStyle(lobby.id), "--lobby-order": order } as CSSProperties
            }
            aria-label={label}
            aria-current={isDisplayed ? "true" : undefined}
            aria-disabled={isDisabled || undefined}
            onClick={join}
          >
            {lobby.isTextOnly ? "#" : getDisplayInitials(lobby.name)}
            {/* Somebody in there is sharing a screen: a red dot on the
                corner, as the stage and the full row say "CANLI". */}
            {isLive && (
              <span className="ct-lobby-mini-live" aria-hidden="true" />
            )}
            {unreadCount > 0 && (
              <span className="ct-lobby-mini-unread" aria-hidden="true">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            {!lobby.isTextOnly && seatCount > 0 && (
              <span className="ct-lobby-mini-count" aria-hidden="true">
                {seatCount}
              </span>
            )}
          </button>
        </Tooltip>
        </OdakMenu>
      </li>
    );
  };

  return (
    <nav className="ct-lobby-compact" aria-label="Lobiler">
      <ul>{voiceRooms.map((lobby, index) => renderRoom(lobby, index))}</ul>
      {voiceRooms.length > 0 && textRooms.length > 0 && (
        <hr className="ct-lobby-compact-divider" />
      )}
      <ul>
        {textRooms.map((lobby, index) =>
          renderRoom(lobby, voiceRooms.length + index),
        )}
      </ul>
      {onCreateLobby && (
        <Tooltip title="Lobi oluştur" placement="right">
          <button
            type="button"
            className="ct-lobby-compact-create"
            onClick={onCreateLobby}
            disabled={isCreatingLobby}
            aria-label="Lobi oluştur"
          >
            <Icon size={20}>
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </Icon>
          </button>
        </Tooltip>
      )}
    </nav>
  );
}
