import type { JSX } from "react";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import { OdakMenuHeader, type OdakMenuEntry } from "@/ui/odak-menu";
import { getDisplayInitials } from "../../../workspace-utils";

/**
 * The menu on a room, open to everybody (the owner's decision, F10.2): the way
 * in for anyone, the room's settings and its deletion for whoever manages it.
 * The same in the open list and in the folded strip.
 *
 * Not offered, because the app has nothing behind them yet: "Okundu işaretle"
 * (the unread count clears only by reading the room) and "Bildirimleri sessize
 * al" (there is no per-room notification setting). Renaming is a field of the
 * settings window, not an action of its own.
 */
export function buildRoomMenu({
  lobby,
  isDisplayed,
  isJoined,
  busy,
  onJoin,
  onSettings,
  onDelete,
}: {
  lobby: LobbyDescriptor;
  /** Its chat or stage is the one on screen. */
  isDisplayed: boolean;
  /** The voice room your microphone is in. */
  isJoined: boolean;
  /** Why a click on it does nothing right now ("katılınıyor"). */
  busy?: string;
  onJoin: () => void;
  /** For whoever manages it; settings hold the name too. */
  onSettings?: () => void;
  /** Absent for the main room, which cannot be deleted. */
  onDelete?: () => void;
}): OdakMenuEntry[] {
  return [
    {
      key: "join",
      icon: lobby.isTextOnly ? "message" : "login",
      label: lobby.isTextOnly ? "Odayı aç" : isJoined ? "Odaya dön" : "Katıl",
      disabled: isDisplayed ? (lobby.isTextOnly ? "açık" : "buradasın") : (busy ?? false),
      onSelect: onJoin,
    },
    onSettings && { type: "divider" },
    onSettings && {
      key: "settings",
      icon: "sliders",
      label: "Oda ayarları",
      description: "Ad, kapasite, kilit ve şifre",
      opensDialog: true,
      onSelect: onSettings,
    },
    onDelete && { type: "divider" },
    onDelete && {
      key: "delete",
      icon: "trash",
      label: "Odayı sil",
      opensDialog: true,
      danger: true,
      onSelect: onDelete,
    },
  ];
}

/** Which room, for the folded strip, whose badge shows only its initials. */
export function RoomMenuHeader({
  lobby,
  seatCount,
}: {
  lobby: LobbyDescriptor;
  seatCount: number;
}): JSX.Element {
  return (
    <OdakMenuHeader
      lead={
        <span className="ct-menu-identity-tile" aria-hidden="true">
          {lobby.isTextOnly ? "#" : getDisplayInitials(lobby.name)}
        </span>
      }
      name={lobby.name}
      detail={lobby.isTextOnly ? "Mesaj odası" : `Sesli oda · ${seatCount} kişi`}
    />
  );
}
