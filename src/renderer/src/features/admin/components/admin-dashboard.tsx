import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { Spin, Alert, Tag, Tooltip, Button } from "antd";
import {
  UserOutlined,
  GlobalOutlined,
  HomeOutlined,
  TeamOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  PieChartOutlined,
  LineChartOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminStats, AdminLobbyEvent } from "@shared/auth-contracts";
import { getDisplayInitials, hueStyle } from "@/ui/person-style";
import {
  AdminPageHeader,
  AdminRefreshedAt,
  AdminSection,
  AdminStatGrid,
  type AdminStat,
} from "./admin-primitives";

// The five metric tiles differed only in colour and copy, so they were five
// near-identical blocks of inline styles. One shape, one data array.
const buildStatCards = (stats: AdminStats | null): AdminStat[] => [
  {
    tone: "violet",
    label: "Toplam Kullanıcı",
    value: stats?.totalUsers ?? 0,
    icon: <UserOutlined />,
    hint: (
      <>
        <ArrowUpOutlined /> Son 30 gün içinde
      </>
    ),
  },
  {
    tone: "emerald",
    label: "Çevrimiçi",
    value: stats?.onlineUsers ?? 0,
    icon: <GlobalOutlined />,
    hint: (
      <>
        <span className="ct-stat-pulse-dot" /> Anlık aktif bağlantı
      </>
    ),
  },
  {
    tone: "blue",
    label: "Aktif Odalar",
    value: stats?.totalLobbies ?? 0,
    icon: <HomeOutlined />,
    hint: "Canlı sesli kanallar",
  },
  {
    tone: "amber",
    label: "Odadaki Üyeler",
    value: stats?.activeMembers ?? 0,
    icon: <TeamOutlined />,
    hint: "Görüşmedeki kullanıcılar",
  },
  {
    tone: "red",
    label: "Bugünkü Olaylar",
    value: stats?.todayEvents ?? 0,
    icon: <CalendarOutlined />,
    hint: "Son 24 saatteki oda olayları",
  },
];

// The tone is a feed dot's colour: the same three meanings the tags use
// everywhere else in the panel.
const EVENT_LABELS: Record<string, { tone: string; text: string }> = {
  join: { tone: "ok", text: "odaya girdi" },
  leave: { tone: "danger", text: "odadan çıktı" },
  create: { tone: "info", text: "oda oluşturdu" },
  delete: { tone: "warn", text: "odayı sildi" },
  edit: { tone: "info", text: "odayı güncelledi" },
};

const DESCRIPTION =
  "Sunucunun anlık durumu, kullanıcılar ve oda hareketliliği. Sayfa 10 saniyede bir kendini yeniler.";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<AdminLobbyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // What the header's timestamp shows. The page repolls every ten seconds and
  // nothing on it moved visibly when a poll succeeded, so a stale panel and a
  // live one looked identical.
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // Chart data: hourly activity metrics
  const activityTrendData = stats?.activityTrend || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const maxTrendVal = Math.max(...activityTrendData) || 1;

  // Two requests, not three. The third was adminService.listUsers() — the whole
  // user table, with every avatar as a base64 data URL — pulled every 10
  // seconds so this component could count admins, members, verified and banned
  // rows in the browser. The counts come from /admin/stats now, which had the
  // list in hand anyway, and the polled payload went from megabytes to a few
  // hundred bytes.
  const fetchDashboardData = useCallback(async (): Promise<void> => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        adminService.getStats(),
        adminService.listLobbyEvents({ limit: 6 }),
      ]);
      setStats(statsRes.stats);
      setRecentEvents(eventsRes.events || []);
      setRefreshedAt(new Date());
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Gösterge paneli verileri alınamadı"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardData();
    const interval = setInterval(() => void fetchDashboardData(), 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // The page keeps its title through loading and failure, like every other
  // page: a bare spinner or alert was the one screen with no heading.
  const header = (
    <AdminPageHeader
      title="Genel Bakış"
      description={DESCRIPTION}
      actions={
        <>
          <AdminRefreshedAt at={refreshedAt} failed={Boolean(error)} />
          <Button icon={<ReloadOutlined />} onClick={() => void fetchDashboardData()}>
            Yenile
          </Button>
        </>
      }
    />
  );

  if (loading && !stats) {
    return (
      <div className="ct-admin-page">
        {header}
        <div className="ct-admin-center-state">
          <Spin size="large" />
          <span>İstatistikler yükleniyor…</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="ct-admin-page">
        {header}
        <Alert
          className="ct-alert"
          title="Hata"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  const adminCount = stats?.adminUsers ?? 0;
  const memberCount = stats?.memberUsers ?? 0;
  const verifiedCount = stats?.verifiedUsers ?? 0;
  const bannedCount = stats?.bannedUsers ?? 0;

  // Never zero: the donut divides by it.
  const totalUsers = stats?.totalUsers || 1;
  const adminPercentage = Math.round((adminCount / totalUsers) * 100);
  const memberPercentage = Math.round((memberCount / totalUsers) * 100);
  const verifiedPercentage = Math.round((verifiedCount / totalUsers) * 100);

  // SVG Donut calculation
  const radius = 40;
  const circumference = 2 * Math.PI * radius; // 251.3
  const adminStrokeLength = (adminCount / totalUsers) * circumference;
  const memberStrokeLength = (memberCount / totalUsers) * circumference;

  // SVG Area path generation
  const chartWidth = 500;
  const chartHeight = 120;
  const padding = 20;
  const points = activityTrendData.map((val: number, idx: number) => {
    const x = padding + (idx * (chartWidth - padding * 2)) / (activityTrendData.length - 1);
    const y = chartHeight - padding - (val / maxTrendVal) * (chartHeight - padding * 2);
    return { x, y, val };
  });

  const linePath = points.map((p: { x: number; y: number; val: number }, i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  const dbState =
    stats?.dbStatus === "connected"
      ? { tone: "ok", text: "PostgreSQL · bağlı" }
      : stats?.dbStatus === "in_memory"
        ? { tone: "warn", text: "Bellek içi · kalıcı değil" }
        : { tone: "danger", text: "PostgreSQL · bağlantı yok" };
  const liveKitState =
    stats?.liveKitStatus === "connected"
      ? { tone: "ok", text: "Bağlı" }
      : { tone: "danger", text: "Bağlantı yok" };
  const modeText =
    stats?.envMode === "production"
      ? "Üretim (production)"
      : stats?.envMode === "test"
        ? "Test"
        : "Geliştirme (development)";

  return (
    <div className="ct-admin-page">
      {header}

      <AdminStatGrid stats={buildStatCards(stats)} />

      {/* A plain CSS grid, not antd's <Row gutter>. The gutter is a negative
          margin on the row plus a matching padding on each column, so these
          cards used to hang 8px past both edges of the stat grid above. */}
      <div className="ct-admin-grid-split">
        <AdminSection
          title="Oda hareketliliği"
          description="Saat başına giriş, çıkış ve oda olayları."
          icon={<LineChartOutlined />}
          hint="Son 12 saat"
        >
          <div className="ct-chart-body">
            <div className="ct-chart-plot">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                width="100%"
                height="100%"
              >
                {/* Colours come from classes, not from stroke/fill
                    attributes — an inline attribute is the one place a
                    var() cannot reach, so the whole chart used to stay on the
                    dark palette's white grid lines. */}
                <defs>
                  <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop className="ct-chart-area-stop" offset="0%" stopOpacity="0.45" />
                    <stop className="ct-chart-area-stop" offset="100%" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid lines */}
                <line className="ct-chart-grid" x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} strokeWidth="1" />
                <line className="ct-chart-grid faint" x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} strokeWidth="1" strokeDasharray="3,3" />
                <line className="ct-chart-grid faint" x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} strokeWidth="1" strokeDasharray="3,3" />

                {/* Area path */}
                <path d={areaPath} fill="url(#area-gradient)" />

                {/* Line path */}
                <path className="ct-chart-line" d={linePath} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />

                {/* Data Point Circles */}
                {points.map((p: { x: number; y: number; val: number }, idx: number) => (
                  <g key={idx}>
                    <circle className="ct-chart-dot" cx={p.x} cy={p.y} r="4.5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <Tooltip title={`${activityTrendData.length - idx} saat önce: ${p.val} olay`}>
                      <circle cx={p.x} cy={p.y} r="10" fill="transparent" cursor="pointer" />
                    </Tooltip>
                  </g>
                ))}
              </svg>
            </div>
            <div className="ct-chart-axis">
              <span>12 saat önce</span>
              <span>8 saat önce</span>
              <span>4 saat önce</span>
              <span>Şimdi</span>
            </div>
          </div>
        </AdminSection>

        <AdminSection
          title="Kullanıcılar"
          description="Rollere göre dağılım."
          icon={<PieChartOutlined />}
          footer={
            <>
              <span>
                Doğrulanmış e-posta <strong>%{verifiedPercentage}</strong>
              </span>
              <span>
                Yasaklı <strong>{bannedCount}</strong>
              </span>
            </>
          }
        >
          <div className="ct-donut-row">
            <div className="ct-donut">
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle className="ct-donut-track" cx="50" cy="50" r={radius} fill="transparent" strokeWidth="10" />

                <circle
                  className="ct-donut-arc members"
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  strokeWidth="10"
                  strokeDasharray={`${memberStrokeLength} ${circumference}`}
                  strokeLinecap="round"
                />

                <circle
                  className="ct-donut-arc admins"
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  strokeWidth="10"
                  strokeDasharray={`${adminStrokeLength} ${circumference}`}
                  strokeDashoffset={-memberStrokeLength}
                  strokeLinecap="round"
                />
              </svg>
              <div className="ct-donut-center">
                <strong>{totalUsers}</strong>
                <span>Kullanıcı</span>
              </div>
            </div>

            <div className="ct-legend">
              <div className="ct-legend-item">
                <span className="ct-legend-dot admins" />
                <div>
                  <strong>Yöneticiler · {adminCount}</strong>
                  <span>%{adminPercentage}</span>
                </div>
              </div>
              <div className="ct-legend-item">
                <span className="ct-legend-dot members" />
                <div>
                  <strong>Üyeler · {memberCount}</strong>
                  <span>%{memberPercentage}</span>
                </div>
              </div>
            </div>
          </div>
        </AdminSection>
      </div>

      <div className="ct-admin-grid-halves">
        <AdminSection
          title="Son olaylar"
          description="Odalara son girenler, çıkanlar ve oda değişiklikleri."
          icon={<ClockCircleOutlined />}
          hint={recentEvents.length > 0 ? `${recentEvents.length} olay` : undefined}
          flush
        >
          {recentEvents.length === 0 ? (
            <div className="ct-admin-empty-state">
              <ClockCircleOutlined />
              <strong>Henüz olay yok</strong>
              <span>Biri bir odaya girdiğinde burada görünür.</span>
            </div>
          ) : (
            <ul className="ct-admin-feed">
              {recentEvents.map((item) => {
                const label = EVENT_LABELS[item.eventType] ?? {
                  tone: "info",
                  text: item.eventType,
                };

                return (
                  <li key={item.id}>
                    <span
                      className="ct-admin-face ct-hued"
                      style={hueStyle(item.userId)}
                      aria-hidden="true"
                    >
                      {getDisplayInitials(item.username)}
                    </span>
                    <div className="ct-admin-feed-text">
                      <span>
                        <strong>@{item.username}</strong> {label.text}
                      </span>
                      <span className="ct-admin-feed-meta">
                        <span className={`ct-admin-status-dot ${label.tone}`} />
                        {item.lobbyName}
                      </span>
                    </div>
                    <time className="ct-admin-feed-time">
                      {new Date(item.occurredAt).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminSection>

        <AdminSection
          title="Sistem durumu"
          description="Sunucunun bağlı olduğu servisler ve adresleri."
          icon={<DatabaseOutlined />}
          flush
        >
          <ul className="ct-admin-status-list">
            <li>
              <span className={`ct-admin-status-dot ${dbState.tone}`} />
              <strong>Veritabanı</strong>
              <span>{dbState.text}</span>
            </li>
            <li>
              <span className={`ct-admin-status-dot ${liveKitState.tone}`} />
              <strong>LiveKit ses/görüntü sunucusu</strong>
              <span>{liveKitState.text}</span>
            </li>
            <li>
              <span className="ct-admin-status-dot info" />
              <strong>Çalışma modu</strong>
              <Tag className="ct-tag">{modeText}</Tag>
            </li>
            <li>
              <span className="ct-admin-status-dot" />
              <strong>API adresi</strong>
              <code className="ct-admin-mono">{stats?.apiUrl || "—"}</code>
            </li>
            <li>
              <span className="ct-admin-status-dot" />
              <strong>LiveKit adresi</strong>
              <code className="ct-admin-mono">{stats?.liveKitUrl || "—"}</code>
            </li>
          </ul>
        </AdminSection>
      </div>
    </div>
  );
}
