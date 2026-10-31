import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { OdakMenu } from "@/ui/odak-menu";
import type { SelectablePresenceStatus } from "@shared/auth-contracts";
import type { WorkspaceSection } from "@/store/ui-store";
import { AuthLogoMark, isAdminRole } from "@/features/auth";
import { getUserStatusLabel } from "../../workspace-utils";
import type { FriendsController } from "../../hooks/user/use-friends";
import { UserProfileCardPopover } from "../user/user-profile-card";
import { Avatar, PresenceGlyph, SECTIONS, presenceMenu } from "./odak-parts";

export interface OdakRailProps {
  activeSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  currentUserRole: string;
  unreadLobbyMessages: number;
  unreadDirectMessages: number;
  currentUserId: string;
  currentUsername: string;
  currentUserAvatarUrl?: string | null;
  presenceStatus: SelectablePresenceStatus;
  onPresenceStatusChange: (status: SelectablePresenceStatus) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  /** Only so your profile card can render. */
  friends: FriendsController;
  /** The shell's quick-controls dock, in the sections that have no sidebar
      to carry it (Oyunlar, Fırsatlar); folded, above the avatar. */
  dock?: ReactNode;
}

/**
 * The Odak section rail: the shell draws it for every section, and the
 * Arkadaşlar page draws the same one in the same place over the shell. Both
 * sections that keep a badge are unmounted while elsewhere, so this is the
 * only thing that can report their traffic.
 */
export function OdakRail({
  activeSection,
  onSectionChange,
  currentUserRole,
  unreadLobbyMessages,
  unreadDirectMessages,
  currentUserId,
  currentUsername,
  currentUserAvatarUrl,
  presenceStatus,
  onPresenceStatusChange,
  onLogout,
  isLoggingOut,
  friends,
  dock,
}: OdakRailProps) {
  // A count already showing when the rail mounts (a section switch) stays
  // still; one that turns up afterwards pops.
  const [calm, setCalm] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setCalm(false), 300);
    return () => window.clearTimeout(timer);
  }, []);
  const statusLabel = getUserStatusLabel(presenceStatus !== "offline", presenceStatus);
  const statusMenu = presenceMenu({
    status: presenceStatus,
    onChange: onPresenceStatusChange,
    onLogout,
    isLoggingOut,
  });

  return (
    <nav className={`ct-odak-rail ${calm ? "calm" : ""}`} aria-label="Bölümler">
      <span className="ct-odak-logo" aria-hidden="true">
        <AuthLogoMark />
      </span>
      {SECTIONS.filter((section) => section.id !== "admin" || isAdminRole(currentUserRole)).map(
        (section) => {
          const active = section.id === activeSection;
          const badge =
            section.id === "lobbies"
              ? unreadLobbyMessages
              : section.id === "users"
                ? unreadDirectMessages
                : 0;
          return (
            <button
              key={section.id}
              type="button"
              className={`ct-odak-rail-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSectionChange(section.id)}
            >
              {section.icon}
              {section.label}
              {badge > 0 && <span className="ct-odak-count">{badge > 99 ? "99+" : badge}</span>}
            </button>
          );
        },
      )}
      <div className="ct-odak-fill" />
      {dock && <div className="ct-odak-rail-dock">{dock}</div>}
      {/* Your face opens your profile card, as anyone's does elsewhere. Your
          status (and Çıkış yap) is a row under it, and in the dock beside the
          rail wherever the dock shows it. Opens to the right, from the foot. */}
      <UserProfileCardPopover
        userId={currentUserId}
        fallbackName={currentUsername}
        currentUserId={currentUserId}
        friends={friends}
        placement="rightBottom"
        selfFooter={
          <OdakMenu trigger="click" items={statusMenu} placement="top" width={280}>
            <button type="button" className="ct-profile-card-self-status">
              <PresenceGlyph status={presenceStatus} className="ct-odak-menu-dot" />
              <strong>{statusLabel}</strong>
              <span>Durumunu değiştir</span>
            </button>
          </OdakMenu>
        }
      >
        <Tooltip title="Profilin" placement="right">
          <button type="button" className="ct-odak-me" aria-label={`Profilin, ${statusLabel}`}>
            <Avatar
              userId={currentUserId}
              name={currentUsername}
              avatarUrl={currentUserAvatarUrl}
              presence={presenceStatus}
              className="me"
            />
          </button>
        </Tooltip>
      </UserProfileCardPopover>
    </nav>
  );
}
