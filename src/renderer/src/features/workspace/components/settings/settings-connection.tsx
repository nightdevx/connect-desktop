import { useEffect, useRef, useState } from "react";
import { Alert, Button, Steps } from "antd";
import { ExperimentOutlined, MonitorOutlined } from "@ant-design/icons";
import { toErrorMessage } from "@shared/error-message";
import {
  runNetworkTest,
  type NetworkTestStep,
  type NetworkTestStepId,
} from "@/features/livekit";
import { workspaceService } from "../../services";
import { PageHeader } from "@/ui/page-header";

// "Ağ testi": livekit-client's connection checks against the real server, in a
// room of the user's own. The answer to "is it my network or the server" that
// the in-call numbers cannot give, because those only exist once a call works.

const STEP_TITLES: Record<NetworkTestStepId, string> = {
  websocket: "Sunucuya bağlantı",
  webrtc: "Medya bağlantısı",
  audio: "Ses gönderme",
  reconnect: "Kopan bağlantıyı toparlama",
  path: "Ses yolu (UDP / TCP)",
};

const PASSED: Record<NetworkTestStepId, string> = {
  websocket: "Sunucuya ulaşılıyor.",
  webrtc: "Ses ve görüntü bağlantısı kuruluyor.",
  audio: "Ses sunucuya ulaşıyor.",
  reconnect: "Bağlantı koparsa birkaç saniyede kendini topluyor.",
  path: "Ses doğrudan UDP ile gidiyor; bu en iyi yol.",
};

const FAILED: Record<NetworkTestStepId, string> = {
  websocket:
    "Sunucuya ulaşılamıyor. Güvenlik duvarı, VPN ya da kurumsal ağ bağlantıyı engelliyor olabilir.",
  webrtc:
    "Ses bağlantısı kurulamıyor. Ağınız ses trafiğini engelliyor olabilir; VPN'i kapatıp ya da başka bir ağda deneyin.",
  audio:
    "Bağlantı kuruluyor ama ses paketleri sunucuya ulaşmıyor. Güvenlik duvarı ya da VPN ses trafiğini kesiyor olabilir.",
  reconnect: "Kopan bağlantı birkaç saniye içinde geri gelmedi.",
  path: "Ses için kullanılabilen bir yol bulunamadı.",
};

const describePath = (step: NetworkTestStep): string => {
  const path = step.path;
  if (!path?.udp) {
    return FAILED.path;
  }
  const fallback =
    path.tcp === "tcp"
      ? " UDP engellenirse TCP yedeği de çalışıyor."
      : " TCP yedeği denenemedi; UDP çalıştığı sürece sorun değil.";
  if (path.udp === "udp") {
    return `${PASSED.path}${fallback}`;
  }
  if (path.udp === "relay") {
    return "Ses bir aktarıcı (TURN) üzerinden gidiyor: çalışır, ama doğrudan yola göre daha gecikmeli.";
  }
  return "UDP kullanılamıyor, ses TCP ile gidiyor. Çalışır, ama paket kaybında gecikme artar: ağınız (ya da VPN) UDP'yi engelliyor olabilir.";
};

const describeAudio = (step: NetworkTestStep): string => {
  const audio = step.audio;
  if (!audio) {
    return PASSED.audio;
  }
  const parts = [`${audio.packetsSent} paket gönderildi`];
  if (audio.lossPct !== null) {
    parts.push(`kayıp %${audio.lossPct.toLocaleString("tr-TR")}`);
  }
  if (audio.rttMs !== null) {
    parts.push(`gidiş-dönüş ${audio.rttMs} ms`);
  }
  const verdict =
    step.status === "warned"
      ? "Ses sunucuya ulaşıyor ama bağlantı zayıf; konuşmada kesilme ya da gecikme olabilir."
      : PASSED.audio;
  return `${verdict} (${parts.join(", ")})`;
};

const describeStep = (step: NetworkTestStep): string | undefined => {
  switch (step.status) {
    case "pending":
      return undefined;
    case "running":
      return "Deneniyor…";
    case "skipped":
      return "Önceki adım başarısız olduğu için denenmedi.";
    case "failed": {
      const reason = step.logs.find((log) => log.level === "error")?.message;
      return reason ? `${FAILED[step.id]} (${reason})` : FAILED[step.id];
    }
    default: {
      if (step.id === "path") {
        return describePath(step);
      }
      if (step.id === "audio") {
        return describeAudio(step);
      }
      const warning = step.logs.find((log) => log.level === "warning")?.message;
      return step.status === "warned" && warning
        ? `${PASSED[step.id]} Uyarı: ${warning}`
        : PASSED[step.id];
    }
  }
};

const stepStatus = (step: NetworkTestStep): "wait" | "process" | "finish" | "error" => {
  switch (step.status) {
    case "running":
      return "process";
    case "failed":
      return "error";
    case "pending":
    case "skipped":
      return "wait";
    default:
      return "finish";
  }
};

export function SettingsConnection() {
  const [steps, setSteps] = useState<NetworkTestStep[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The checks run on after the screen closes; only their reports stop.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const start = async (): Promise<void> => {
    setRunning(true);
    setError(null);
    setSteps(null);
    try {
      const result = await workspaceService.createNetworkTestToken();
      if (!result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Test başlatılamadı");
      }
      const { serverUrl, token, iceServers } = result.data;
      await runNetworkTest(
        { serverUrl, token, iceServers },
        (next) => {
          if (!unmounted.current) {
            setSteps(next);
          }
        },
        () => unmounted.current,
      );
    } catch (err) {
      if (!unmounted.current) {
        setError(toErrorMessage(err, "Ağ testi çalıştırılamadı"));
      }
    } finally {
      if (!unmounted.current) {
        setRunning(false);
      }
    }
  };

  const failed = steps?.some((step) => step.status === "failed") ?? false;
  const finished = Boolean(steps) && !running;

  return (
    <div className="ct-settings-section">
      <PageHeader
        className="ct-settings-section-header"
        title="Bağlantı"
        description="Sesin gelmiyor ya da kopuyorsa sorunun ağında mı sunucuda mı olduğunu buradan anlayabilirsin."
      />

      <div className="ct-settings-content">
        <div className="ct-settings-subsection">
          <h5>Ağ Testi</h5>

          <div className="ct-settings-card">
            <div className="ct-settings-row">
              <div className="ct-settings-row-text">
                <strong>Bağlantını sunucuyla dene</strong>
                <span>
                  Sunucuya ulaşma, ses bağlantısı kurma, ses gönderme, kopan
                  bağlantıyı toparlama ve UDP / TCP yolu adım adım denenir.
                  Yaklaşık yarım dakika sürer ve kendi odanda yapılır: mikrofonun
                  açılmaz, görüşmedeysen kimse bir şey duymaz.
                </span>
              </div>
            </div>

            {steps ? (
              <Steps
                orientation="vertical"
                size="small"
                items={steps.map((step) => ({
                  title: STEP_TITLES[step.id],
                  status: stepStatus(step),
                  content: describeStep(step),
                }))}
              />
            ) : null}

            {error ? <Alert className="ct-alert" type="error" showIcon title={error} /> : null}

            {finished ? (
              <Alert
                className="ct-alert"
                type={failed ? "warning" : "success"}
                showIcon
                title={
                  failed
                    ? "Bağlantında sorun var: yukarıda kırmızı olan adım nedenini söylüyor."
                    : "Bağlantın sunucuyla sorunsuz çalışıyor."
                }
              />
            ) : null}

            <div className="ct-settings-actions">
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                loading={running}
                onClick={() => void start()}
              >
                {steps ? "Testi Yeniden Çalıştır" : "Testi Başlat"}
              </Button>
              {/* For support: every connection the app has open, with its
                  candidates, codecs and graphs, and a button that saves it all. */}
              <Button
                type="text"
                icon={<MonitorOutlined />}
                onClick={() => void window.desktopApi.openWebRtcInternals?.()}
              >
                WebRTC ayrıntıları
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
