import { toErrorMessage } from "@shared/error-message";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BadgeProps } from "antd";
import { Card, Col, Row, Spin, Alert, List, Tag, Badge, Tooltip, Space } from "antd";
import {
  UserOutlined,
  GlobalOutlined,
  HomeOutlined,
  TeamOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminStats, AdminLobbyEvent } from "@shared/auth-contracts";

interface StatCard {
  tone: "violet" | "emerald" | "blue" | "amber" | "red";
  label: string;
  value: number;
  icon: ReactNode;
  hint: ReactNode;
}

// The five metric tiles differed only in colour and copy, so they were five
// near-identical blocks of inline styles. One shape, one data array.
const buildStatCards = (stats: AdminStats | null): StatCard[] => [
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
    hint: "Son 24 saat lobi aktiviteleri",
  },
];

// antd Badge status is a fixed union — "purple" is a Tag preset colour, not a
// status, so `as any` was hiding a value antd silently ignores. Typed, so the
// next label that wants a new colour fails to compile instead of rendering grey.
const EVENT_LABELS: Record<
  string,
  { badge: BadgeProps["status"]; text: string }
> = {
  join: { badge: "success", text: "giriş yaptı" },
  leave: { badge: "error", text: "çıkış yaptı" },
  create: { badge: "default", text: "oda oluşturdu" },
  delete: { badge: "warning", text: "odayı sildi" },
  edit: { badge: "processing", text: "odayı güncelledi" },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<AdminLobbyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart data: hourly activity metrics
  const activityTrendData = stats?.activityTrend || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const maxTrendVal = Math.max(...activityTrendData) || 1;

  // Two requests, not three. The third was adminService.listUsers() — the whole
  // user table, with every avatar as a base64 data URL — pulled every 10
  // seconds so this component could count admins, members, verified and banned
  // rows in the browser. The counts come from /admin/stats now, which had the
  // list in hand anyway, and the polled payload went from megabytes to a few
  // hundred bytes.
  const fetchDashboardData = async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        adminService.getStats(),
        adminService.listLobbyEvents({ limit: 5 }),
      ]);
      setStats(statsRes.stats);
      setRecentEvents(eventsRes.events || []);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Gösterge paneli verileri alınamadı"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      // `tip` only renders in antd's nested or fullscreen pattern, so on a bare
      // Spin it was dropped and the typo in it never showed up either.
      <div className="ct-admin-center-state">
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <span>İstatistikler yükleniyor…</span>
        </Space>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <Alert
        className="ct-alert"
        message="Hata"
        description={error}
        type="error"
        showIcon
      />
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

  return (
    <div className="ct-admin-page">
      <header className="ct-admin-page-header">
        <h1>Sistem İncelemesi</h1>
        <p>
          Connect sunucu durumuna, veritabanına ve kullanım grafiklerine genel
          bakış
        </p>
      </header>

      <div className="ct-stat-grid">
        {buildStatCards(stats).map((card) => (
          <article key={card.label} className={`ct-stat-card ${card.tone}`}>
            <div className="ct-stat-card-top">
              <div>
                <div className="ct-stat-label">{card.label}</div>
                <div className="ct-stat-value">{card.value}</div>
              </div>
              <span className="ct-stat-icon" aria-hidden="true">
                {card.icon}
              </span>
            </div>
            <div className="ct-stat-hint">{card.hint}</div>
          </article>
        ))}
      </div>

      {/* SVG Charts Section */}
      <Row gutter={[16, 16]}>
        {/* Activity Trend Line Chart */}
        <Col xs={24} lg={15}>
          <Card
            className="ct-admin-card"
            title="Lobi Olay Hareketliliği (Son 12 Saat)"
          >
            <div className="ct-chart-body">
              <div className="ct-chart-caption">Olay Sayısı Gelişimi</div>
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
                  <path className="ct-chart-line" d={linePath} fill="none" strokeWidth="2.5" />

                  {/* Data Point Circles */}
                  {points.map((p: { x: number; y: number; val: number }, idx: number) => (
                    <g key={idx}>
                      <circle className="ct-chart-dot" cx={p.x} cy={p.y} r="4.5" strokeWidth="2" />
                      <Tooltip title={`${idx + 1} saat önce: ${p.val} olay`}>
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
          </Card>
        </Col>

        {/* Roles Donut Chart */}
        <Col xs={24} lg={9}>
          <Card className="ct-admin-card" title="Kullanıcı Rol Dağılımı">
            <div className="ct-donut-row">
              <div className="ct-donut">
                <svg viewBox="0 0 100 100" width="100%" height="100%">
                  {/* Outer circle background */}
                  <circle className="ct-donut-track" cx="50" cy="50" r={radius} fill="transparent" strokeWidth="10" />

                  {/* Members arc */}
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

                  {/* Admins arc */}
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
                    <strong>Yöneticiler ({adminCount})</strong>
                    <span>%{adminPercentage} Pay</span>
                  </div>
                </div>
                <div className="ct-legend-item">
                  <span className="ct-legend-dot members" />
                  <div>
                    <strong>Üyeler ({memberCount})</strong>
                    <span>%{memberPercentage} Pay</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ct-card-footnote">
              <span>
                Doğrulanmış E-posta: <strong>%{verifiedPercentage}</strong>
              </span>
              <span>
                Yasaklı Üye: <strong>{bannedCount}</strong>
              </span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Live Activity & System Info */}
      <Row gutter={[16, 16]}>
        {/* Live Activity Feed */}
        <Col xs={24} md={12}>
          <Card
            className="ct-admin-card"
            title={
              <>
                <ClockCircleOutlined />
                Canlı Aktivite Akışı
              </>
            }
          >
            {recentEvents.length === 0 ? (
              <div className="ct-admin-center-state">
                Henüz sistem aktivitesi loglanmadı.
              </div>
            ) : (
              <List
                dataSource={recentEvents}
                renderItem={(item) => {
                  const label = EVENT_LABELS[item.eventType] ?? {
                    badge: "default",
                    text: item.eventType.toUpperCase(),
                  };

                  return (
                    <List.Item>
                      <div className="ct-activity-row">
                        <Space>
                          <Badge status={label.badge} />
                          <strong>@{item.username}</strong>
                          <span>{label.text}</span>
                          <Tag>{item.lobbyName}</Tag>
                        </Space>
                        <span className="ct-activity-time">
                          {new Date(item.occurredAt).toLocaleTimeString("tr-TR")}
                        </span>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* System Info & Health */}
        <Col xs={24} md={12}>
          <Card
            className="ct-admin-card"
            title={
              <>
                <DatabaseOutlined />
                Sistem Durumu & Yapılandırma
              </>
            }
          >
            <div className="ct-chart-body">
              <div className="ct-admin-kv-grid">
                <div className="ct-admin-kv">
                  <span>Veritabanı Servisi</span>
                  <strong>
                    {stats?.dbStatus === "connected" ? (
                      <>
                        <CheckCircleOutlined className="ct-icon-success" />
                        PostgreSQL (Bağlı)
                      </>
                    ) : stats?.dbStatus === "in_memory" ? (
                      <>
                        <CheckCircleOutlined className="ct-icon-warning" />
                        SQLite (Bellek İçi)
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined className="ct-icon-danger" />
                        PostgreSQL (Bağlantı Yok)
                      </>
                    )}
                  </strong>
                </div>

                <div className="ct-admin-kv">
                  <span>LiveKit Video/Ses Sunucusu</span>
                  <strong>
                    {stats?.liveKitStatus === "connected" ? (
                      <>
                        <ThunderboltOutlined className="ct-icon-warning" />
                        Aktif / Bağlı
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined className="ct-icon-danger" />
                        Bağlantı Yok
                      </>
                    )}
                  </strong>
                </div>
              </div>

              <div className="ct-admin-kv-grid">
                <div className="ct-admin-kv plain">
                  <span>Bağlantı Adresi</span>
                  <strong>{stats?.apiUrl || "http://127.0.0.1:4000"}</strong>
                </div>
                <div className="ct-admin-kv plain">
                  <span>Çalışma Modu</span>
                  <strong>
                    {stats?.envMode === "production"
                      ? "Üretim (Production)"
                      : stats?.envMode === "test"
                        ? "Test"
                        : "Geliştirme (Development)"}
                  </strong>
                </div>
                <div className="ct-admin-kv plain">
                  <span>LiveKit URL</span>
                  <strong>
                    {stats?.liveKitUrl || "wss://livekitservice..."}
                  </strong>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
