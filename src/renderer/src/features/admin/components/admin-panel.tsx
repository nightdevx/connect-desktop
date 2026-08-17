import { useUiStore } from "../../../store/ui-store";
import AdminSidebar from "@/features/admin/components/admin-sidebar";
import AdminDashboard from "@/features/admin/components/admin-dashboard";
import AdminUsers from "@/features/admin/components/admin-users";
import AdminLobbies from "@/features/admin/components/admin-lobbies";
import AdminActivity from "@/features/admin/components/admin-activity";
import AdminSounds from "@/features/admin/components/admin-sounds";

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
      case "sounds":
        return <AdminSounds />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="ct-admin-panel-shell">
      <AdminSidebar />
      <div className="ct-admin-panel-content">{renderContent()}</div>
    </div>
  );
}
