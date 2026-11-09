import { useState, type JSX } from "react";
import { Segmented } from "antd";
import {
  AuditOutlined,
  CloudServerOutlined,
  FundProjectionScreenOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import AdminActivity from "./admin-activity";
import AdminAudit from "./admin-audit";
import AdminDiagnostics from "./admin-diagnostics";
import AdminMediaHealth from "./admin-media-health";

type RecordsTab = "diagnostics" | "activity" | "audit" | "media-health";

const TABS: Array<{ value: RecordsTab; label: string; icon: JSX.Element }> = [
  { value: "diagnostics", label: "Yayın Tanılama", icon: <FundProjectionScreenOutlined /> },
  { value: "activity", label: "Oda Etkinliği", icon: <HistoryOutlined /> },
  { value: "audit", label: "Denetim Kaydı", icon: <AuditOutlined /> },
  { value: "media-health", label: "Medya Sağlığı", icon: <CloudServerOutlined /> },
];

/**
 * The four screens that answer "what happened, and how are the calls doing":
 * broadcast diagnostics, room activity, the audit log and media health. They
 * were four entries in the side menu; here they are tabs of one page. Only the
 * open tab is mounted, so a closed one polls nothing.
 */
export default function AdminRecords() {
  const [tab, setTab] = useState<RecordsTab>("diagnostics");

  return (
    <div className="ct-admin-records">
      <Segmented
        value={tab}
        onChange={(value) => setTab(value as RecordsTab)}
        className="ct-segmented-premium ct-admin-records-tabs"
        options={TABS}
      />

      {tab === "diagnostics" && <AdminDiagnostics />}
      {tab === "activity" && <AdminActivity />}
      {tab === "audit" && <AdminAudit />}
      {tab === "media-health" && <AdminMediaHealth />}
    </div>
  );
}
