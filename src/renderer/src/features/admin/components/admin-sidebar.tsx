import { useUiStore } from "../../../store/ui-store";
import {
  DashboardOutlined,
  UserOutlined,
  HomeOutlined,
  HistoryOutlined,
} from "@ant-design/icons";

export default function AdminSidebar() {
  const { adminSection, setAdminSection } = useUiStore();

  const menuItems = [
    { key: "dashboard", label: "İnceleme", icon: <DashboardOutlined /> },
    { key: "users", label: "Kullanıcılar", icon: <UserOutlined /> },
    { key: "lobbies", label: "Aktif Odalar", icon: <HomeOutlined /> },
    { key: "activity", label: "Aktivite Logları", icon: <HistoryOutlined /> },
  ] as const;

  return (
    <div
      style={{
        width: "220px",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        background: "rgba(20, 20, 20, 0.6)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 20px 20px 20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "#a855f7" }}>
          Yönetim Paneli
        </h2>
        <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.45)" }}>
          Sistem Yönetim Araçları
        </span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 8px" }}>
        {menuItems.map((item) => {
          const active = adminSection === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setAdminSection(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 16px",
                borderRadius: "6px",
                border: "none",
                background: active ? "rgba(168, 85, 247, 0.15)" : "transparent",
                color: active ? "#c084fc" : "rgba(255, 255, 255, 0.75)",
                fontSize: "14px",
                fontWeight: active ? "600" : "400",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
