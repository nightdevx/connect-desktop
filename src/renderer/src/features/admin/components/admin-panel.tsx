import { useUiStore } from "../../../store/ui-store";
import AdminSidebar from "@/features/admin/components/admin-sidebar";
import AdminDashboard from "@/features/admin/components/admin-dashboard";
import AdminUsers from "@/features/admin/components/admin-users";
import AdminLobbies from "@/features/admin/components/admin-lobbies";
import AdminActivity from "@/features/admin/components/admin-activity";

export default function AdminPanel() {
  const adminSection = useUiStore((state) => state.adminSection);

  const renderContent = () => {
    switch (adminSection) {
      case "dashboard":
        return <AdminDashboard />;
      case "users":
        return <AdminUsers />;
      case "lobbies":
        return <AdminLobbies />;
      case "activity":
        return <AdminActivity />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gridColumn: "span 2",
        height: "100%",
        width: "100%",
        background: "rgba(10, 10, 10, 0.45)",
        backdropFilter: "blur(16px)",
        color: "#ffffff",
        overflow: "hidden",
      }}
    >
      <AdminSidebar />
      <div
        style={{
          flex: 1,
          padding: "24px",
          overflowY: "auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}
