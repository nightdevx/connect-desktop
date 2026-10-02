import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Button, Segmented, Spin, Table } from "antd";
import {
  ApiOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  SoundOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import type {
  AdminMediaHealth,
  AdminMediaHealthDist,
  AdminMediaHealthRatio,
  AdminMediaHealthWindow,
} from "@shared/desktop-api-types";
import adminService from "../services/admin-service";
import { AdminPageHeader, AdminSection } from "./admin-primitives";

// LiveKit's own view of the calls, read from its /metrics by the backend. The
// client-side diagnostics say what one person's machine saw; this says what the
// server saw for everyone, which is the only place "is it the server or is it
// them" can be answered.

// The numbers are histograms over thousands of samples: a minute changes
// nothing a person could read, and every refresh is a scrape of the SFU.
const REFRESH_INTERVAL_MS = 30_000;

type WindowLabel = AdminMediaHealthWindow["label"];

const WINDOW_LABELS: Record<WindowLabel, string> = {
  "1h": "Son 1 saat",
  "24h": "Son 24 saat",
  sinceStart: "LiveKit açılışından beri",
};

const formatPercent = (share: number | null | undefined): string => {
  if (share === null || share === undefined) {
    return "—";
  }
  return `%${(share * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
};

const formatNumber = (value: number | null | undefined, unit: string): string => {
  if (value === null || value === undefined) {
    return "—";
  }
  const digits = value < 10 ? 2 : 0;
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: digits })} ${unit}`;
};

const formatSpan = (seconds: number): string => {
  if (seconds <= 0) {
    return "veri yok";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) {
    return `${minutes} dk`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 72 ? `${hours} sa` : `${Math.round(hours / 24)} gün`;
};

const formatRatio = (ratio: AdminMediaHealthRatio): string => {
  if (ratio.rate === null) {
    return "—";
  }
  return `${formatPercent(ratio.rate)} (${ratio.successes.toLocaleString("tr-TR")} / ${ratio.attempts.toLocaleString("tr-TR")})`;
};

// A quantile that landed beyond the last bucket is only known to be at least
// that bucket's bound.
const formatQuantile = (dist: AdminMediaHealthDist, value: number | null, unit: string): string => {
  const capped = value !== null && dist.cappedAt !== null && value >= dist.cappedAt;
  return `${capped ? "≥" : ""}${formatNumber(value, unit)}`;
};

// One cell of the per-direction table: the tail first, because the tail is
// what people hear. A mean only where the scale is bounded: one corrupt RTT
// report from LiveKit, minutes long, is enough to make an average of thousands
// of samples meaningless, while the quantiles do not move.
const describeDist = (
  dist: AdminMediaHealthDist,
  unit: string,
  threshold: string,
  thresholdLabel: string,
  withMean: boolean,
): string => {
  if (dist.samples <= 0) {
    return "örnek yok";
  }
  return [
    `p95 ${formatQuantile(dist, dist.p95, unit)}`,
    `p50 ${formatQuantile(dist, dist.p50, unit)}`,
    ...(withMean ? [`ort. ${formatNumber(dist.mean, unit)}`] : []),
    `${thresholdLabel}: ${formatPercent(dist.over[threshold])}`,
  ].join(" · ");
};

type Tone = "emerald" | "amber" | "red" | "blue";

// Lower is better: the share of microphone samples that lost more than 1%.
// Production sat at 1.2% up and 2.6% down before the connectivity work.
const lossTone = (share: number | null): Tone => {
  if (share === null) return "blue";
  if (share < 0.02) return "emerald";
  return share < 0.05 ? "amber" : "red";
};

// Higher is better: signal connections that went on to connect media.
const joinTone = (rate: number | null): Tone => {
  if (rate === null) return "blue";
  if (rate >= 0.95) return "emerald";
  return rate >= 0.85 ? "amber" : "red";
};

interface HeadlineCard {
  tone: Tone;
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}

const buildHeadline = (health: AdminMediaHealth, window: AdminMediaHealthWindow): HeadlineCard[] => [
  {
    tone: lossTone(window.upload.lossPercent.over["1"] ?? null),
    label: "Kayıplı ses (yükleme)",
    value: formatPercent(window.upload.lossPercent.over["1"]),
    hint: "İstemciden sunucuya giden mikrofon örneklerinin %1'den fazla kayıp yaşayanları",
    icon: <CloudUploadOutlined />,
  },
  {
    tone: lossTone(window.download.lossPercent.over["1"] ?? null),
    label: "Kayıplı ses (indirme)",
    value: formatPercent(window.download.lossPercent.over["1"]),
    hint: "Sunucudan istemcilere giden mikrofon örneklerinin %1'den fazla kayıp yaşayanları",
    icon: <CloudDownloadOutlined />,
  },
  {
    tone: joinTone(window.joins.rate),
    label: "Medyaya ulaşan katılım",
    value: formatPercent(window.joins.rate),
    hint: "Sunucuya bağlanan oturumların sesi gerçekten bağlananları",
    icon: <ApiOutlined />,
  },
  {
    tone: "blue",
    label: "Şu an",
    value: `${health.rooms ?? "—"} oda · ${health.participants ?? "—"} kişi`,
    hint: "LiveKit'in açık oda ve katılımcı sayısı",
    icon: <TeamOutlined />,
  },
];

interface DirectionRow {
  key: string;
  metric: string;
  upload: string;
  download: string;
}

const buildDirectionRows = (window: AdminMediaHealthWindow): DirectionRow[] => [
  {
    key: "loss",
    metric: "Paket kaybı",
    upload: describeDist(window.upload.lossPercent, "%", "5", ">%5", true),
    download: describeDist(window.download.lossPercent, "%", "5", ">%5", true),
  },
  {
    key: "rtt",
    metric: "Gidiş-dönüş (RTT)",
    upload: describeDist(window.upload.rttMs, "ms", "200", ">200 ms", false),
    download: describeDist(window.download.rttMs, "ms", "200", ">200 ms", false),
  },
  {
    key: "jitter",
    metric: "Titreşim (jitter)",
    upload: describeDist(window.upload.jitterMs, "ms", "30", ">30 ms", false),
    download: describeDist(window.download.jitterMs, "ms", "30", ">30 ms", false),
  },
];

export default function AdminMediaHealth() {
  const [health, setHealth] = useState<AdminMediaHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<WindowLabel>("24h");

  const load = useCallback(async () => {
    try {
      const data = await adminService.unwrap(
        adminService.ops.mediaHealth(),
        "Sunucu medya ölçümleri alınamadı",
      );
      setHealth(data.health);
      setRefreshedAt(new Date());
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Sunucu medya ölçümleri alınamadı"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !health) {
    return (
      <div className="ct-admin-page">
        <div className="ct-admin-center-state">
          <Spin size="large" />
          <span>LiveKit ölçümleri okunuyor…</span>
        </div>
      </div>
    );
  }

  const current = health?.windows.find((entry) => entry.label === selected) ?? null;

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Sunucu Medya Sağlığı"
        description="LiveKit'in kendi ölçümleri: mikrofonların iki yöndeki kaybı, gecikmesi ve titreşimi, katılımların ve bağlantıların ne kadarının başarılı olduğu. 30 saniyede bir yenilenir."
        actions={
          <>
            {error || refreshedAt ? (
              <span className="ct-admin-section-hint">
                {error
                  ? "Yenilenemedi — son bilinen veriler"
                  : `Güncellendi ${refreshedAt?.toLocaleTimeString("tr-TR")}`}
              </span>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              Yenile
            </Button>
          </>
        }
      />

      {error && !health ? (
        <Alert className="ct-alert" type="error" showIcon title="Hata" description={error} />
      ) : null}

      {health && !health.configured ? (
        <Alert
          className="ct-alert"
          type="info"
          showIcon
          title="Yapılandırılmamış"
          description="Backend LiveKit'in ölçüm adresini bilmiyor. LIVEKIT_API_URL iç ağdaki LiveKit'i (http://…:7880) gösterdiğinde adres kendiliğinden bulunur; gerekirse LIVEKIT_METRICS_URL ile verilir."
        />
      ) : null}

      {health?.configured && health.error ? (
        <Alert
          className="ct-alert"
          type="warning"
          showIcon
          title="LiveKit ölçümlerine ulaşılamadı"
          description={health.error}
        />
      ) : null}

      {health?.configured && !health.error && current ? (
        <>
          <Segmented<WindowLabel>
            value={selected}
            onChange={setSelected}
            options={(Object.keys(WINDOW_LABELS) as WindowLabel[]).map((label) => ({
              label: WINDOW_LABELS[label],
              value: label,
            }))}
          />
          {current.partial ? (
            <span className="ct-admin-section-hint">
              {current.seconds > 0
                ? `Bu pencerenin yalnız ${formatSpan(current.seconds)}'lık kısmı var: backend o zamandan beri ölçüyor.`
                : "Bu pencere için henüz ölçüm yok: backend yeni başladı, ilk karşılaştırma 5 dakika içinde gelir."}
            </span>
          ) : (
            <span className="ct-admin-section-hint">Kapsanan süre: {formatSpan(current.seconds)}</span>
          )}

          <div className="ct-stat-grid">
            {buildHeadline(health, current).map((card) => (
              <article key={card.label} className={`ct-stat-card ${card.tone}`}>
                <div className="ct-stat-card-top">
                  <div>
                    <span className="ct-stat-label">{card.label}</span>
                    <span className="ct-stat-value">{card.value}</span>
                  </div>
                  <span className="ct-stat-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                </div>
                <div className="ct-stat-hint">{card.hint}</div>
              </article>
            ))}
          </div>

          <AdminSection title="Mikrofon sesi, yön yön" icon={<SoundOutlined />} flush>
            <Table<DirectionRow>
              dataSource={buildDirectionRows(current)}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              className="ct-admin-table-wrap"
              columns={[
                { title: "Ölçü", dataIndex: "metric", key: "metric" },
                { title: "Yükleme (istemci → sunucu)", dataIndex: "upload", key: "upload" },
                { title: "İndirme (sunucu → istemci)", dataIndex: "download", key: "download" },
              ]}
            />
          </AdminSection>

          <div className="ct-admin-grid-halves">
            <AdminSection title="Bağlantılar" icon={<ApiOutlined />}>
              <div className="ct-admin-kv-grid">
                <div className="ct-admin-kv">
                  <span>Sinyalden medyaya</span>
                  <strong>{formatRatio(current.joins)}</strong>
                </div>
                <div className="ct-admin-kv">
                  <span>Abonelikler</span>
                  <strong>{formatRatio(current.subscriptions)}</strong>
                </div>
                <div className="ct-admin-kv">
                  <span>Oturum kurulumu (p50 / p95)</span>
                  <strong>
                    {formatQuantile(current.sessionStartMs, current.sessionStartMs.p50, "ms")} /{" "}
                    {formatQuantile(current.sessionStartMs, current.sessionStartMs.p95, "ms")}
                  </strong>
                </div>
                {current.ice.map((entry) => (
                  <div key={entry.transport} className="ct-admin-kv">
                    <span>ICE, {entry.transport === "PUBLISHER" ? "gönderim" : "alım"} bağlantısı</span>
                    <strong>{formatRatio(entry)}</strong>
                  </div>
                ))}
              </div>
            </AdminSection>

            <AdminSection title="LiveKit kalite puanı" icon={<TeamOutlined />}>
              <div className="ct-admin-kv-grid">
                <div className="ct-admin-kv">
                  <span>Mükemmel</span>
                  <strong>{formatPercent(current.quality.excellent)}</strong>
                </div>
                <div className="ct-admin-kv">
                  <span>İyi</span>
                  <strong>{formatPercent(current.quality.good)}</strong>
                </div>
                <div className="ct-admin-kv">
                  <span>Zayıf</span>
                  <strong>{formatPercent(current.quality.poor)}</strong>
                </div>
                <div className="ct-admin-kv">
                  <span>Kopuk</span>
                  <strong>{formatPercent(current.quality.lost)}</strong>
                </div>
              </div>
            </AdminSection>
          </div>

          <span className="ct-admin-section-hint">
            Tıkanıklık (CONGESTED) ve kısa ICE bağlantısı sayıları LiveKit'in ölçüm çıktısında yok; yalnız sunucu logunda görünür.
            {current.ice.length === 0 ? " ICE oranları LiveKit 1.13 ile gelir." : ""}
          </span>
        </>
      ) : null}
    </div>
  );
}
