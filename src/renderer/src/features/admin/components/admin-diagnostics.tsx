import { useCallback, useEffect, useState } from "react";
import { Button, Descriptions, Drawer, Input, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, DownloadOutlined, FileZipOutlined } from "@ant-design/icons";
import {
  MEDIA_DIAGNOSTIC_PROBLEM_LABELS,
  deriveVerdicts,
  type MediaDiagnosticsSessionRow,
} from "@shared/media-diagnostics";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { toast } from "@/services/toast";

const PAGE_SIZE = 50;

const PROBLEM_OPTIONS = [
  { value: "", label: "Tüm oturumlar" },
  ...Object.entries(MEDIA_DIAGNOSTIC_PROBLEM_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const problemTone = (problem: string): string => {
  if (
    problem === "software-encoder" ||
    problem === "cpu-limited" ||
    problem === "bandwidth-limited"
  ) {
    return "red";
  }
  if (problem === "receiver-freezes" || problem === "packet-loss" || problem === "audio-concealment") {
    return "orange";
  }
  return "blue";
};

const formatDuration = (ms: number | undefined): string => {
  if (!ms || ms <= 0) {
    return "—";
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds} sn`;
  }
  return `${minutes} dk ${seconds} sn`;
};

/** Session-relative mm:ss, so an episode can be found in the exported entries. */
const clock = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const mbps = (bps: number | null | undefined): string => {
  if (typeof bps !== "number" || bps <= 0) {
    return "—";
  }
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
};

export default function AdminDiagnostics() {
  const [sessions, setSessions] = useState<MediaDiagnosticsSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(0);
  const [userId, setUserId] = useState("");
  const [problem, setProblem] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MediaDiagnosticsSessionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.listDiagnosticSessions({
          userId: userId.trim() || undefined,
          problem: problem || undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        "Tanılama oturumları yüklenemedi",
      );
      setSessions(data.sessions);
      setTotal(data.total);
      setEnabled(data.enabled);
      setRetentionDays(data.retentionDays);
    } catch (error) {
      toast.error(toErrorMessage(error, "Tanılama oturumları yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [userId, problem, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportSession = useCallback(async (sessionId: string) => {
    setExporting(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.exportDiagnosticSession({ sessionId }),
        "Tanılama kaydı indirilemedi",
      );
      if (data.saved) {
        toast.success(`Kaydedildi: ${data.path}`);
      }
    } catch (error) {
      toast.error(toErrorMessage(error, "Tanılama kaydı indirilemedi"));
    } finally {
      setExporting(false);
    }
  }, []);

  const exportRange = useCallback(async () => {
    setExporting(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.exportDiagnosticRange({
          userId: userId.trim() || undefined,
          problem: problem || undefined,
        }),
        "Tanılama kayıtları indirilemedi",
      );
      if (data.saved) {
        toast.success(`Kaydedildi: ${data.path}`);
      }
    } catch (error) {
      toast.error(toErrorMessage(error, "Tanılama kayıtları indirilemedi"));
    } finally {
      setExporting(false);
    }
  }, [userId, problem]);

  const columns: ColumnsType<MediaDiagnosticsSessionRow> = [
    {
      title: "Başlangıç",
      dataIndex: "startedAt",
      width: 165,
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    { title: "Kullanıcı", dataIndex: "username", width: 140 },
    { title: "Oda", dataIndex: "lobbyId", width: 150 },
    {
      title: "Süre",
      key: "duration",
      width: 100,
      render: (_: unknown, row) => formatDuration(row.summary?.durationMs),
    },
    {
      title: "Kodlayıcı",
      key: "encoder",
      width: 150,
      render: (_: unknown, row) => {
        const video = row.summary?.outboundVideo;
        if (!video) {
          return <span className="ct-muted">—</span>;
        }
        const codec = Object.keys(video.codecs)[0] ?? "?";
        const hardware = video.hardwareEncoderSamples >= video.softwareEncoderSamples;
        return (
          <span>
            <Tag color={hardware ? "green" : "red"}>
              {hardware ? "donanım" : "yazılım"}
            </Tag>
            {codec}
          </span>
        );
      },
    },
    {
      title: "Sorunlar",
      key: "problems",
      render: (_: unknown, row) =>
        row.problems.length === 0 ? (
          <Tag color="green">temiz</Tag>
        ) : (
          <span>
            {row.problems.map((item) => (
              <Tag key={item} color={problemTone(item)}>
                {MEDIA_DIAGNOSTIC_PROBLEM_LABELS[item] ?? item}
              </Tag>
            ))}
          </span>
        ),
    },
    {
      title: "Kayıt",
      dataIndex: "entryCount",
      width: 90,
    },
    {
      title: "",
      key: "actions",
      width: 190,
      render: (_: unknown, row) => (
        <span className="ct-admin-row-actions">
          <Button size="small" onClick={() => setSelected(row)}>
            Özet
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => void exportSession(row.sessionId)}
          >
            İndir
          </Button>
        </span>
      ),
    },
  ];

  const summary = selected?.summary ?? null;
  const client = selected?.client ?? null;
  const episodes = summary?.episodes ?? [];
  const remotes = summary?.remotes ?? [];
  // Re-derived rather than read off the stored session: a session recorded
  // before a rule existed still gets judged by today's rules, and the stored
  // list stays a cache rather than the source of truth.
  const verdicts = summary ? deriveVerdicts(summary) : [];

  return (
    <div className="ct-admin-section">
      <header className="ct-admin-section-header">
        <div>
          <h3>Yayın Tanılama</h3>
          <p>
            {enabled
              ? `Ses ve görüntü oturumları sunucuda saklanıyor; ${retentionDays > 0 ? `${retentionDays} gün sonra siliniyor` : "süresiz saklanıyor"}.`
              : "Toplama kapalı (MEDIA_DIAGNOSTICS_ENABLED=false)."}
          </p>
        </div>
        <div className="ct-admin-section-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Yenile
          </Button>
          <Button
            type="primary"
            icon={<FileZipOutlined />}
            loading={exporting}
            onClick={() => void exportRange()}
          >
            Filtrelenenleri tek dosyaya indir
          </Button>
        </div>
      </header>

      <div className="ct-admin-filters">
        <Input.Search
          placeholder="Kullanıcı kimliği"
          allowClear
          onSearch={(value) => {
            setPage(1);
            setUserId(value);
          }}
          style={{ maxWidth: 280 }}
        />
        <Select
          value={problem}
          options={PROBLEM_OPTIONS}
          onChange={(value) => {
            setPage(1);
            setProblem(value);
          }}
          style={{ width: 260 }}
        />
      </div>

      <Table
        rowKey="sessionId"
        size="small"
        loading={loading}
        dataSource={sessions}
        columns={columns}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width={520}
        title={selected ? `${selected.username} · ${selected.lobbyId || "oda yok"}` : ""}
        extra={
          selected ? (
            <Button
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={() => void exportSession(selected.sessionId)}
            >
              İndir
            </Button>
          ) : null
        }
      >
        {selected ? (
          <>
            {/* The answer first. Everything below is the evidence a reader used
                to have to assemble by hand from thousands of sample rows. */}
            {verdicts.length > 0 ? (
              <div className="ct-admin-verdicts">
                {verdicts.map((verdict) => (
                  <div key={verdict.code} className="ct-admin-verdict">
                    <strong>{verdict.headline}</strong>
                    <ul>
                      {verdict.evidence.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
            <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Oturum">{selected.sessionId}</Descriptions.Item>
            <Descriptions.Item label="Süre">
              {formatDuration(summary?.durationMs)}
            </Descriptions.Item>
            <Descriptions.Item label="Kayıt / olay / örnek">
              {selected.entryCount} / {summary?.events ?? 0} / {summary?.samples ?? 0}
            </Descriptions.Item>
            <Descriptions.Item label="Uygulama">
              {client?.appVersion ?? "—"} · {client?.platform ?? "—"} {client?.osVersion ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label="Chromium">
              {client?.chromeVersion ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="GPU video encode">
              {client?.gpu?.videoEncode ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Donanım SVC codec">
              {client?.hardwareSvcCodec ?? "yok"}
            </Descriptions.Item>
            <Descriptions.Item label="Codec tercihi">
              {client?.prefs?.videoCodec ?? "—"} · donanım hızlandırma{" "}
              {client?.prefs?.hardwareAcceleration ? "açık" : "kapalı"}
            </Descriptions.Item>
            <Descriptions.Item label="Gecikme (min/ort/maks)">
              {summary?.rttMs
                ? `${summary.rttMs.min} / ${summary.rttMs.mean} / ${summary.rttMs.max} ms`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Giden video">
              {summary?.outboundVideo
                ? `${Object.keys(summary.outboundVideo.resolutions).join(", ") || "—"} · ${
                    summary.outboundVideo.fps?.mean ?? "—"
                  } fps · ${mbps(summary.outboundVideo.bitrateBps?.mean)}`
                : "—"}
            </Descriptions.Item>
            {/* Capture against encoder. Equal and low is a starved capture;
                source high with fps low is an encoder that cannot keep up. */}
            <Descriptions.Item label="Yakalama / kodlama">
              {summary?.outboundVideo?.sourceFps
                ? `${Math.round(summary.outboundVideo.sourceFps.mean)} fps üretildi → ${
                    summary.outboundVideo.fps
                      ? Math.round(summary.outboundVideo.fps.mean)
                      : "—"
                  } fps kodlandı${
                    summary.outboundVideo.framesDroppedPct
                      ? ` · düşen kare %${summary.outboundVideo.framesDroppedPct.mean}`
                      : ""
                  }`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Kare başına kodlama">
              {summary?.outboundVideo?.encodeMsPerFrame
                ? `${summary.outboundVideo.encodeMsPerFrame.mean} ms (maks ${summary.outboundVideo.encodeMsPerFrame.max} ms)`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Kodlayıcı kısıtı (süre)">
              {summary?.outboundVideo
                ? `cpu ${summary.outboundVideo.limitationSeconds?.cpu ?? 0} sn · bant ${
                    summary.outboundVideo.limitationSeconds?.bandwidth ?? 0
                  } sn · diğer ${summary.outboundVideo.limitationSeconds?.other ?? 0} sn`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Yükleme başlık payı">
              {mbps(summary?.availableOutgoingBitrateBps?.mean)}
            </Descriptions.Item>
            <Descriptions.Item label="Alınan video donma">
              {summary?.inboundVideo?.freezeCountMax ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Ses tamamlama">
              {summary?.inboundAudioConcealmentPct
                ? `%${summary.inboundAudioConcealmentPct.max}`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Paket kaybı (giden/gelen)">
              {`${summary?.packetLossOutboundPct?.max ?? "—"} / ${summary?.packetLossInboundPct?.max ?? "—"}`}
            </Descriptions.Item>
            <Descriptions.Item label="Uyarılar">
              {summary && Object.keys(summary.warnings).length > 0
                ? Object.entries(summary.warnings).map(([text, count]) => (
                    <div key={text}>
                      {text} ({count})
                    </div>
                  ))
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Sorunlar">
              {selected.problems.length === 0
                ? "temiz"
                : selected.problems
                    .map((item) => MEDIA_DIAGNOSTIC_PROBLEM_LABELS[item] ?? item)
                    .join(", ")}
            </Descriptions.Item>
            {/* Who sounded bad. One peer is their uplink; everybody is this
                machine's downlink, and the pooled numbers could not say. */}
            <Descriptions.Item label="Katılımcı bazında alım">
              {remotes.length === 0
                ? "—"
                : remotes.map((remote) => (
                    <div key={remote.identity}>
                      {remote.identity.slice(0, 8)} · kayıp %
                      {remote.packetLossPct?.mean ?? 0} · kesinti %
                      {remote.concealmentPct?.mean ?? 0} · jitter{" "}
                      {remote.jitterMs?.mean ?? "—"} ms
                    </div>
                  ))}
            </Descriptions.Item>
            <Descriptions.Item label="Sorun dilimleri">
              {episodes.length === 0
                ? "—"
                : episodes.map((episode, index) => (
                    <div key={`${episode.problem}-${episode.startMs}-${index}`}>
                      {clock(episode.startMs)}–{clock(episode.endMs)} ·{" "}
                      {MEDIA_DIAGNOSTIC_PROBLEM_LABELS[episode.problem] ??
                        episode.problem}
                      {episode.peak === null ? "" : ` · en kötü ${episode.peak}`}
                    </div>
                  ))}
            </Descriptions.Item>
          </Descriptions>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
