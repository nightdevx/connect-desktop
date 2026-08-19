import { Tooltip, Badge } from "antd";
import {
  TeamOutlined,
  AppstoreOutlined,
  GiftOutlined,
  RocketOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import type { WorkspaceSection } from "@/store/ui-store";
import { isAdminRole } from "@/features/auth";

interface WorkspaceRailProps {
  workspaceSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  totalUnreadDirectMessages?: number;
  totalUnreadLobbyMessages?: number;
  currentUserRole?: string;
  currentUsername?: string;
  currentUserId?: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

interface RailItem {
  section: WorkspaceSection;
  label: string;
  title: string;
  icon: ReactNode;
}

const ITEMS: RailItem[] = [
  {
    section: "users",
    label: "Arkadaş",
    title: "Arkadaşlar",
    icon: <TeamOutlined />,
  },
  {
    section: "lobbies",
    label: "Lobiler",
    title: "Lobiler",
    icon: <AppstoreOutlined />,
  },
  {
    section: "free-games",
    label: "Kampanya",
    title: "Ücretsiz Oyunlar",
    icon: <GiftOutlined />,
  },
  {
    section: "minigames",
    label: "Oyunlar",
    title: "Oyunlar",
    icon: <RocketOutlined />,
  },
  {
    section: "settings",
    label: "Ayarlar",
    title: "Ayarlar",
    icon: <SettingOutlined />,
  },
  {
    section: "admin",
    label: "Yönetim",
    title: "Yönetim",
    icon: <SafetyCertificateOutlined />,
  },
];

export function WorkspaceRail({
  workspaceSection,
  onSectionChange,
  totalUnreadDirectMessages,
  totalUnreadLobbyMessages,
  currentUserRole,
  onLogout,
  isLoggingOut,
}: WorkspaceRailProps) {
  const items = ITEMS.filter(
    (item) => item.section !== "admin" || isAdminRole(currentUserRole),
  );

  return (
    <aside className="ct-rail" aria-label="Navigasyon">
      <nav className="ct-rail-items">
        {items.map((item) => {
          const isActive = workspaceSection === item.section;
          // Both sections are unmounted whenever they are not the current one,
          // so this rail is the only thing that can report their traffic.
          const badgeCount =
            item.section === "users"
              ? totalUnreadDirectMessages
              : item.section === "lobbies"
                ? totalUnreadLobbyMessages
                : undefined;

          return (
            <Tooltip
              key={item.section}
              title={item.title}
              placement="right"
              mouseEnterDelay={0.15}
            >
              <div className="ct-rail-item">
                <span
                  className={`ct-rail-indicator ${isActive ? "active" : ""}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={`ct-rail-button ${isActive ? "active" : ""}`}
                  onClick={() => onSectionChange(item.section)}
                  aria-label={item.title}
                  aria-current={isActive ? "page" : undefined}
                >
                  {badgeCount !== undefined ? (
                    <Badge count={badgeCount} size="small" offset={[6, -2]}>
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                  <span>{item.label}</span>
                </button>
              </div>
            </Tooltip>
          );
        })}
      </nav>

      {onLogout && (
        <Tooltip title="Çıkış Yap" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item ct-rail-spacer">
            <button
              type="button"
              className="ct-rail-button danger"
              onClick={onLogout}
              disabled={isLoggingOut}
              aria-label="Çıkış Yap"
            >
              <LogoutOutlined />
              <span>Çıkış</span>
            </button>
          </div>
        </Tooltip>
      )}
    </aside>
  );
}
