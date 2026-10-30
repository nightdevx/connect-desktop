import { useEffect, useState } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { CheckOutlined, LogoutOutlined } from "@ant-design/icons";
import type { SelectablePresenceStatus } from "@shared/auth-contracts";
import type { WorkspaceSection } from "@/store/ui-store";
import { AuthLogoMark, isAdminRole } from "@/features/auth";
import { getPresenceColor, getUserStatusLabel } from "../../workspace-utils";
import { Avatar, PRESENCE_OPTIONS, SECTIONS } from "./odak-parts";

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
}: OdakRailProps) {
  // A count already showing when the rail mounts (a section switch) stays
  // still; one that turns up afterwards pops.
  const [calm, setCalm] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setCalm(false), 300);
    return () => window.clearTimeout(timer);
  }, []);
  const avatarMenu: MenuProps = {
    selectedKeys: [presenceStatus],
    items: [
      ...PRESENCE_OPTIONS.map((option) => ({
        key: option.value,
        label: option.label,
        icon: (
          <span
            className="ct-odak-menu-dot"
            style={{ background: getPresenceColor(option.value !== "offline", option.value) }}
          />
        ),
        extra: option.value === presenceStatus ? <CheckOutlined /> : undefined,
        onClick: () => onPresenceStatusChange(option.value),
      })),
      { type: "divider" as const },
      {
        key: "logout",
        label: "Çıkış yap",
        icon: <LogoutOutlined />,
        danger: true,
        disabled: isLoggingOut,
        onClick: onLogout,
      },
    ],
  };

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
      <Dropdown trigger={["click"]} menu={avatarMenu} placement="topLeft">
        <button
          type="button"
          className="ct-odak-me"
          aria-label={`Durumun: ${getUserStatusLabel(presenceStatus !== "offline", presenceStatus)}`}
          title="Durumunu değiştir"
        >
          <Avatar
            userId={currentUserId}
            name={currentUsername}
            avatarUrl={currentUserAvatarUrl}
            presence={getPresenceColor(presenceStatus !== "offline", presenceStatus)}
            className="me"
          />
        </button>
      </Dropdown>
    </nav>
  );
}
