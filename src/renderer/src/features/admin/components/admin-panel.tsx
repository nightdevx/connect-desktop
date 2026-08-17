import { useUiStore } from "@/store/ui-store";
import AdminSidebar from "./admin-sidebar";
import AdminDashboard from "./admin-dashboard";
import AdminUsers from "./admin-users";
import AdminLobbies from "./admin-lobbies";
import AdminActivity from "./admin-activity";
import AdminSounds from "./admin-sounds";

interface AdminPanelProps {
  currentUserId: string;
}

export default function AdminPanel({ currentUserId }: AdminPanelProps) {
  const adminSection = useUiStore((state) => state.adminSection);

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
