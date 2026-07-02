import { useEffect, useState } from "react";
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
import { AdminStats, AdminLobbyEvent, AdminUserDetail } from "@shared/auth-contracts";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<AdminLobbyEvent[]>([]);
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart data: hourly activity metrics
  const activityTrendData = stats?.activityTrend || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const maxTrendVal = Math.max(...activityTrendData) || 1;

  const fetchDashboardData = async () => {
    try {
      const [statsRes, eventsRes, usersRes] = await Promise.all([
        adminService.getStats(),
        adminService.listLobbyEvents({ limit: 5 }),
        adminService.listUsers(),
      ]);
      setStats(statsRes.stats);
      setRecentEvents(eventsRes.events || []);
      setUsers(usersRes.users || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Gösterge paneli verileri alınamadı");
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
      <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", height: "100%" }}>
        <Spin size="large" tip="İstastistikler Yükleniyor..." />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <Alert
        message="Hata"
        description={error}
        type="error"
        showIcon
        style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ffffff" }}
      />
    );
  }

  // Calculate statistics from user details
  const adminCount = users.filter((u) => u.role === "admin").length;
  const memberCount = users.filter((u) => u.role === "member").length;
  const verifiedCount = users.filter((u) => u.emailVerified).length;
  const bannedCount = users.filter((u) => u.bannedAt).length;

  const totalUsers = users.length || stats?.totalUsers || 1;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", height: "100%", paddingBottom: "24px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 4px 0", color: "#ffffff" }}>
          Sistem İncelemesi
        </h1>
        <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.45)", fontSize: "14px" }}>
          Connect sunucu durumuna, veritabanına ve kullanım grafiklerine genel bakış
        </p>
      </div>

      {/* Metric Cards */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", width: "100%" }}>
        <div style={{ flex: "1 1 0px", minWidth: "180px" }}>
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%)",
              borderColor: "rgba(168, 85, 247, 0.2)",
              borderRadius: "12px",
              height: "100%",
            }}
            bodyStyle={{ padding: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "4px" }}>Toplam Kullanıcı</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#c084fc" }}>{stats?.totalUsers || 0}</div>
              </div>
              <UserOutlined style={{ fontSize: "20px", color: "#c084fc", background: "rgba(168, 85, 247, 0.2)", padding: "8px", borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "8px" }}>
              <ArrowUpOutlined style={{ color: "#10b981", marginRight: "4px" }} />
              Son 30 gün içinde
            </div>
          </Card>
        </div>

        <div style={{ flex: "1 1 0px", minWidth: "180px" }}>
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)",
              borderColor: "rgba(16, 185, 129, 0.2)",
              borderRadius: "12px",
              height: "100%",
            }}
            bodyStyle={{ padding: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "4px" }}>Çevrimiçi</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#34d399" }}>{stats?.onlineUsers || 0}</div>
              </div>
              <GlobalOutlined style={{ fontSize: "20px", color: "#34d399", background: "rgba(16, 185, 129, 0.2)", padding: "8px", borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#34d399", animation: "pulse 1.5s infinite" }}></span>
              Anlık aktif bağlantı
            </div>
          </Card>
        </div>

        <div style={{ flex: "1 1 0px", minWidth: "180px" }}>
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)",
              borderColor: "rgba(59, 130, 246, 0.2)",
              borderRadius: "12px",
              height: "100%",
            }}
            bodyStyle={{ padding: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "4px" }}>Aktif Odalar</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#60a5fa" }}>{stats?.totalLobbies || 0}</div>
              </div>
              <HomeOutlined style={{ fontSize: "20px", color: "#60a5fa", background: "rgba(59, 130, 246, 0.2)", padding: "8px", borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "8px" }}>
              Canlı sesli kanallar
            </div>
          </Card>
        </div>

        <div style={{ flex: "1 1 0px", minWidth: "180px" }}>
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)",
              borderColor: "rgba(245, 158, 11, 0.2)",
              borderRadius: "12px",
              height: "100%",
            }}
            bodyStyle={{ padding: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "4px" }}>Odadaki Üyeler</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#fbbf24" }}>{stats?.activeMembers || 0}</div>
              </div>
              <TeamOutlined style={{ fontSize: "20px", color: "#fbbf24", background: "rgba(245, 158, 11, 0.2)", padding: "8px", borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "8px" }}>
              Görüşmedeki kullanıcılar
            </div>
          </Card>
        </div>

        <div style={{ flex: "1 1 0px", minWidth: "180px" }}>
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)",
              borderColor: "rgba(239, 68, 68, 0.2)",
              borderRadius: "12px",
              height: "100%",
            }}
            bodyStyle={{ padding: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "4px" }}>Bugünkü Olaylar</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#f87171" }}>{stats?.todayEvents || 0}</div>
              </div>
              <CalendarOutlined style={{ fontSize: "20px", color: "#f87171", background: "rgba(239, 68, 68, 0.2)", padding: "8px", borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "8px" }}>
              Son 24 saat lobi aktiviteleri
            </div>
          </Card>
        </div>
      </div>

      {/* SVG Charts Section */}
      <Row gutter={[16, 16]}>
        {/* Activity Trend Line Chart */}
        <Col xs={24} lg={15}>
          <Card
            style={{
              background: "rgba(20, 20, 20, 0.4)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              color: "#ffffff",
              minHeight: "280px",
            }}
            title={<span style={{ color: "#ffffff", fontWeight: "600" }}>Lobi Olay Hareketliliği (Son 12 Saat)</span>}
          >
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
                <div>Olay Sayısı Gelişimi</div>
              </div>
              <div style={{ position: "relative", width: "100%", height: "160px" }}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%" style={{ overflow: "visible" }}>
                  <defs>
                    <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines */}
                  <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3,3" />
                  <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3,3" />

                  {/* Area path */}
                  <path d={areaPath} fill="url(#area-gradient)" />
                  
                  {/* Line path */}
                  <path d={linePath} fill="none" stroke="#a855f7" strokeWidth="2.5" />
                  
                  {/* Data Point Circles */}
                  {points.map((p: { x: number; y: number; val: number }, idx: number) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4.5" fill="#141414" stroke="#a855f7" strokeWidth="2" />
                      <Tooltip title={`${idx + 1} saat önce: ${p.val} olay`}>
                        <circle cx={p.x} cy={p.y} r="10" fill="transparent" style={{ cursor: "pointer" }} />
                      </Tooltip>
                    </g>
                  ))}
                </svg>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0 10px", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
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
          <Card
            style={{
              background: "rgba(20, 20, 20, 0.4)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              color: "#ffffff",
              minHeight: "280px",
            }}
            title={<span style={{ color: "#ffffff", fontWeight: "600" }}>Kullanıcı Rol Dağılımı</span>}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: "12px", height: "160px" }}>
              <div style={{ position: "relative", width: "120px", height: "120px" }}>
                <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ transform: "rotate(-90deg)" }}>
                  {/* Outer circle background */}
                  <circle cx="50" cy="50" r={radius} fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                  
                  {/* Members arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth="10"
                    strokeDasharray={`${memberStrokeLength} ${circumference}`}
                    strokeLinecap="round"
                  />
                  
                  {/* Admins arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke="#a855f7"
                    strokeWidth="10"
                    strokeDasharray={`${adminStrokeLength} ${circumference}`}
                    strokeDashoffset={-memberStrokeLength}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Center total text */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#ffffff" }}>{totalUsers}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Kullanıcı</div>
                </div>
              </div>

              {/* Legends */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#a855f7" }}></span>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>Yöneticiler ({adminCount})</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>%{adminPercentage} Pay</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }}></span>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>Üyeler ({memberCount})</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>%{memberPercentage} Pay</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              <span>Doğrulanmış E-posta: <strong>%{verifiedPercentage}</strong></span>
              <span>Yasaklı Üye: <strong>{bannedCount}</strong></span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Live Activity & System Info */}
      <Row gutter={[16, 16]}>
        {/* Live Activity Feed */}
        <Col xs={24} md={12}>
          <Card
            style={{
              background: "rgba(20, 20, 20, 0.4)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              color: "#ffffff",
              minHeight: "260px",
            }}
            title={<span style={{ color: "#ffffff", fontWeight: "600" }}><ClockCircleOutlined style={{ marginRight: "8px" }} />Canlı Aktivite Akışı</span>}
          >
            {recentEvents.length === 0 ? (
              <div style={{ display: "flex", height: "140px", justifyContent: "center", alignItems: "center", color: "rgba(255, 255, 255, 0.35)" }}>
                Henüz sistem aktivitesi loglanmadı.
              </div>
            ) : (
              <List
                dataSource={recentEvents}
                renderItem={(item) => {
                  let badgeColor = "default";
                  let actionText = item.eventType.toUpperCase();
                  if (item.eventType === "join") {
                    badgeColor = "success";
                    actionText = "giriş yaptı";
                  } else if (item.eventType === "leave") {
                    badgeColor = "error";
                    actionText = "çıkış yaptı";
                  } else if (item.eventType === "create") {
                    badgeColor = "purple";
                    actionText = "oda oluşturdu";
                  } else if (item.eventType === "delete") {
                    badgeColor = "warning";
                    actionText = "odayı sildi";
                  } else if (item.eventType === "edit") {
                    badgeColor = "processing";
                    actionText = "odayı güncelledi";
                  }

                  return (
                    <List.Item style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "10px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                        <Space>
                          <Badge status={badgeColor as any} />
                          <span style={{ fontWeight: "600" }}>@{item.username}</span>
                          <span style={{ color: "rgba(255,255,255,0.45)" }}>{actionText}</span>
                          <Tag color="rgba(255,255,255,0.08)" style={{ color: "#ffffff", border: "none" }}>{item.lobbyName}</Tag>
                        </Space>
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
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
            style={{
              background: "rgba(20, 20, 20, 0.4)",
              borderColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              color: "#ffffff",
              minHeight: "260px",
            }}
            title={<span style={{ color: "#ffffff", fontWeight: "600" }}><DatabaseOutlined style={{ marginRight: "8px" }} />Sistem Durumu & Yapılandırma</span>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", marginBottom: "4px" }}>Veritabanı Servisi</div>
                  <Space>
                    {stats?.dbStatus === "connected" ? (
                      <>
                        <CheckCircleOutlined style={{ color: "#10b981" }} />
                        <span style={{ fontWeight: "600" }}>PostgreSQL (Bağlı)</span>
                        <Badge status="success" style={{ marginLeft: "4px" }} />
                      </>
                    ) : stats?.dbStatus === "in_memory" ? (
                      <>
                        <CheckCircleOutlined style={{ color: "#eab308" }} />
                        <span style={{ fontWeight: "600" }}>SQLite (Bellek İçi)</span>
                        <Badge status="warning" style={{ marginLeft: "4px" }} />
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined style={{ color: "#ef4444" }} />
                        <span style={{ fontWeight: "600" }}>PostgreSQL (Bağlantı Yok)</span>
                        <Badge status="error" style={{ marginLeft: "4px" }} />
                      </>
                    )}
                  </Space>
                </div>
                
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", marginBottom: "4px" }}>LiveKit Video/Ses Sunucusu</div>
                  <Space>
                    {stats?.liveKitStatus === "connected" ? (
                      <>
                        <ThunderboltOutlined style={{ color: "#fbbf24" }} />
                        <span style={{ fontWeight: "600" }}>Aktif / Bağlı</span>
                        <Badge status="success" style={{ marginLeft: "4px" }} />
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined style={{ color: "#ef4444" }} />
                        <span style={{ fontWeight: "600" }}>Bağlantı Yok</span>
                        <Badge status="error" style={{ marginLeft: "4px" }} />
                      </>
                    )}
                  </Space>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", fontSize: "13px" }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "2px" }}>Bağlantı Adresi</div>
                  <div style={{ fontWeight: "500", wordBreak: "break-all" }}>{stats?.apiUrl || "http://127.0.0.1:4000"}</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "2px" }}>Çalışma Modu</div>
                  <div style={{ fontWeight: "500" }}>
                    {stats?.envMode === "production" ? "Üretim (Production)" : stats?.envMode === "test" ? "Test" : "Geliştirme (Development)"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "2px" }}>LiveKit URL</div>
                  <div style={{ fontWeight: "500", fontSize: "12px", color: "rgba(255,255,255,0.8)", wordBreak: "break-all" }}>
                    {stats?.liveKitUrl || "wss://livekitservice..."}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
      
      {/* Styles inject for pulse effect */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
