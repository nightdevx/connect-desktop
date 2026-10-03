import { useEffect, useState } from "react";
import { Button } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import type { TwoFactorStatus } from "@shared/auth-contracts";
import { authService } from "@/features/auth";
import { useUiStore } from "@/store/ui-store";
import AdminSidebar from "./admin-sidebar";
import AdminDashboard from "./admin-dashboard";
import AdminUsers from "./admin-users";
import AdminLobbies from "./admin-lobbies";
import AdminActivity from "./admin-activity";
import AdminSounds from "./admin-sounds";
import AdminModeration from "./admin-moderation";
import AdminSettings from "./admin-settings";
import AdminMinigames from "./admin-minigames";
import AdminMusic from "./admin-music";
import AdminChat from "./admin-chat";
import AdminAudit from "./admin-audit";
import AdminMedia from "./admin-media";
import AdminDiagnostics from "./admin-diagnostics";
import AdminMediaHealth from "./admin-media-health";
import AdminAccess from "./admin-access";

interface AdminPanelProps {
  currentUserId: string;
}

// Admin and owner accounts must have two-step sign-in on before the admin routes
// answer them (TOTP_SETUP_REQUIRED). Rather than every page failing with that
// error, the panel says it once and points at the switch.
function AdminTwoFactorGate() {
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);

  return (
    <div className="ct-admin-two-factor-gate">
      <SafetyCertificateOutlined className="ct-admin-two-factor-gate-icon" />
      <h3>İki adımlı doğrulama gerekli</h3>
      <p>
        Yönetici hesaplarında iki adımlı doğrulama zorunlu. Açana kadar yönetim
        paneli kullanılamaz; telefonundaki bir doğrulama uygulamasıyla bir dakikada
        açabilirsin.
      </p>
      <Button
        type="primary"
        icon={<SafetyCertificateOutlined />}
        onClick={() => {
          setSettingsSection("security");
          setWorkspaceSection("settings");
        }}
      >
        Güvenlik ayarlarını aç
      </Button>
    </div>
  );
}

export default function AdminPanel({ currentUserId }: AdminPanelProps) {
  const adminSection = useUiStore((state) => state.adminSection);
  // Read each time the panel opens: turning it on happens in Settings, which
  // the panel is left for. null on a server that predates the feature.
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authService.twoFactorStatus().then((result) => {
      if (!cancelled) {
        setTwoFactor(result.ok && result.data ? result.data : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gated = Boolean(twoFactor?.required && !twoFactor.enabled);

  const renderContent = () => {
    switch (adminSection) {
      case "dashboard":
        return <AdminDashboard />;
      case "users":
        return <AdminUsers currentUserId={currentUserId} />;
      case "lobbies":
        return <AdminLobbies />;
      case "activity":
        return <AdminActivity />;
      case "sounds":
        return <AdminSounds />;
      case "moderation":
        return <AdminModeration />;
      case "minigames":
        return <AdminMinigames />;
      case "music":
        return <AdminMusic />;
      case "chat":
        return <AdminChat />;
      case "audit":
        return <AdminAudit />;
      case "media":
        return <AdminMedia />;
      case "diagnostics":
        return <AdminDiagnostics />;
      case "media-health":
        return <AdminMediaHealth />;
      case "access":
        return <AdminAccess />;
      case "settings":
        return <AdminSettings />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="ct-admin-panel-shell">
      <AdminSidebar />
      <div className="ct-admin-panel-content">
        {gated ? <AdminTwoFactorGate /> : renderContent()}
      </div>
    </div>
  );
}
