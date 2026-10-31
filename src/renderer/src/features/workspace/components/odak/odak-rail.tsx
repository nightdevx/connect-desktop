import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { OdakMenu, type OdakMenuEntry } from "@/ui/odak-menu";
import type { SelectablePresenceStatus } from "@shared/auth-contracts";
import type { WorkspaceSection } from "@/store/ui-store";
import { AuthLogoMark, isAdminRole } from "@/features/auth";
import { getUserStatusLabel } from "../../workspace-utils";
import { Avatar, PRESENCE_OPTIONS, PresenceGlyph, SECTIONS } from "./odak-parts";

// What each choice does that its name does not say (F10.2): "Rahatsız
// etmeyin" silences message notifications (WorkspaceShell), "Çevrimdışı görün"
// keeps the connection, "Boşta" also comes on its own after five idle minutes
// (use-presence-status).
const PRESENCE_DESCRIPTIONS: Record<string, string> = {
  online: "Herkes seni görür",
  idle: "5 dk hareketsiz kalınca kendiliğinden",
  dnd: "Mesaj bildirimleri susar",
  offline: "Bağlı kalırsın, kimse seni görmez",
};

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
  dock,
}: OdakRailProps) {
  // A count already showing when the rail mounts (a section switch) stays
  // still; one that turns up afterwards pops.
  const [calm, setCalm] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setCalm(false), 300);
    return () => window.clearTimeout(timer);
  }, []);
  // The current one carries a ✓ and nothing else; "Çıkış yap" signs out at
  // once (no confirmation, the owner's decision).
  const avatarMenu: OdakMenuEntry[] = [
    ...PRESENCE_OPTIONS.map(
      (option): OdakMenuEntry => ({
        key: option.value,
        label: option.label,
        description: PRESENCE_DESCRIPTIONS[option.value],
        // The glyph the avatars show for it; the label says it in words.
        icon: <PresenceGlyph status={option.value} className="ct-odak-menu-dot" />,
        checked: option.value === presenceStatus,
        onSelect: () => onPresenceStatusChange(option.value),
      }),
    ),
    { type: "divider" },
    {
      key: "logout",
      label: "Çıkış yap",
      icon: "logout",
      danger: true,
      disabled: isLoggingOut,
      onSelect: onLogout,
    },
  ];

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
      <OdakMenu trigger="click" items={avatarMenu} placement="topLeft" width={280}>
        <Tooltip title="Durumunu değiştir" placement="right">
        <button
          type="button"
          className="ct-odak-me"
          aria-label={`Durumun: ${getUserStatusLabel(presenceStatus !== "offline", presenceStatus)}`}
        >
          <Avatar
            userId={currentUserId}
            name={currentUsername}
            avatarUrl={currentUserAvatarUrl}
            presence={presenceStatus}
            className="me"
          />
        </button>
        </Tooltip>
      </OdakMenu>
    </nav>
  );
}
