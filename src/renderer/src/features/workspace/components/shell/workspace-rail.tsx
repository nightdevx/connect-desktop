import { Tooltip, Badge } from "antd";
import { TeamOutlined, AppstoreOutlined, SettingOutlined, SafetyCertificateOutlined, LogoutOutlined } from "@ant-design/icons";
import type { WorkspaceSection } from "@/store/ui-store";
import { isAdminRole } from "@/features/auth/permissions";

interface WorkspaceRailProps {
  workspaceSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  totalUnreadDirectMessages?: number;
  currentUserRole?: string;
  currentUsername?: string;
  currentUserId?: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export function WorkspaceRail({
  workspaceSection,
  onSectionChange,
  totalUnreadDirectMessages,
  currentUserRole,
  onLogout,
  isLoggingOut,
}: WorkspaceRailProps) {
  return (
    <aside className="ct-rail" aria-label="Navigasyon">
      <div className="ct-rail-top-logo">
        <span className="ct-rail-logo">CT</span>
      </div>

      <div className="ct-rail-separator" />

      <div className="ct-rail-items">
        <Tooltip title="Arkadaşlar" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "users" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "users" ? "active" : ""}`}
              onClick={() => onSectionChange("users")}
              aria-label="Arkadaşlar"
            >
              <Badge count={totalUnreadDirectMessages} size="small" offset={[6, -2]}>
                <TeamOutlined className="ct-rail-icon-premium" />
              </Badge>
              <small>Arkadaş</small>
            </button>
          </div>
        </Tooltip>

        <Tooltip title="Lobiler" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "lobbies" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "lobbies" ? "active" : ""}`}
              onClick={() => onSectionChange("lobbies")}
              aria-label="Lobiler"
            >
              <AppstoreOutlined className="ct-rail-icon-premium" />
              <small>Lobiler</small>
            </button>
          </div>
        </Tooltip>

        <Tooltip title="Ayarlar" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "settings" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "settings" ? "active" : ""}`}
              onClick={() => onSectionChange("settings")}
              aria-label="Ayarlar"
            >
              <SettingOutlined className="ct-rail-icon-premium" />
              <small>Ayar</small>
            </button>
          </div>
        </Tooltip>

        {isAdminRole(currentUserRole) && (
          <Tooltip title="Yönetim" placement="right" mouseEnterDelay={0.15}>
            <div className="ct-rail-item-wrapper">
              <div className={`ct-rail-indicator ${workspaceSection === "admin" ? "active" : ""}`} />
              <button
                type="button"
                className={`ct-rail-button-premium ${workspaceSection === "admin" ? "active" : ""}`}
                onClick={() => onSectionChange("admin")}
                aria-label="Yönetim"
              >
                <SafetyCertificateOutlined className="ct-rail-icon-premium" />
                <small>Yönetim</small>
              </button>
            </div>
          </Tooltip>
        )}
      </div>

      {onLogout && (
        <Tooltip title="Çıkış Yap" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper" style={{ marginTop: "auto" }}>
            <button
              type="button"
              className="ct-rail-button-premium"
              onClick={onLogout}
              disabled={isLoggingOut}
              style={{
                color: "#ef4444",
                borderColor: "rgba(239, 68, 68, 0.15)",
                background: "rgba(239, 68, 68, 0.05)"
              }}
              aria-label="Çıkış Yap"
            >
              <LogoutOutlined className="ct-rail-icon-premium" />
              <small>Çıkış</small>
            </button>
          </div>
        </Tooltip>
      )}
    </aside>
  );
}


