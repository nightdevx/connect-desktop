import { useEffect, useRef, useState } from "react";
import { Switch } from "antd";
import {
  CloseOutlined,
  DashboardOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { useMediaStats, type LiveKitConnectionStatus } from "@/features/livekit";
import { useVideoQuality } from "../../hooks/lobby/use-video-quality";
import {
  useWorkspaceAudioConnection,
  type AudioConnectionTone,
} from "../../hooks/lobby/use-workspace-audio-connection";

interface WorkspaceAudioStatusProps {
  activeLobbyId: string | null;
  liveKitConnectionState?: LiveKitConnectionStatus;
  audioProcessingProps: {
    enhancedNoiseSuppressionEnabled: boolean;
    micEnabled: boolean;
    /** Gerçek aktif mod: "none" (devre dışı) | "browser" (tarayıcı NS) | "processor" (RNNoise) */
    activeNoiseMode: "none" | "browser" | "processor";
    onToggleEnhancedNoiseSuppression: () => void;
  };
}

const TONE_LABELS: Record<AudioConnectionTone, string> = {
  ok: "Gecikme düşük",
  warn: "Yüksek ping",
  error: "Bağlantı kesildi",
  idle: "Bağlanıyor",
};

/**
 * The connection card at the foot of the sidebar, and the detail popover it
 * opens.
 *
 * Its own component because it is the only thing on screen that reads the
 * once-a-second media stats sample. Derived in the shell and threaded down as
 * props, that sample re-rendered the whole workspace every second; subscribing
 * here confines it to these ~180 lines, most of which are behind a popover that
 * is usually closed.
 */
export function WorkspaceAudioStatus({
  activeLobbyId,
  liveKitConnectionState,
  audioProcessingProps,
}: WorkspaceAudioStatusProps) {
  const [isAudioPopupOpen, setIsAudioPopupOpen] = useState(false);
  const audioAnchorRef = useRef<HTMLDivElement | null>(null);
  const mediaStats = useMediaStats();

  const audioConnectionProps = useWorkspaceAudioConnection({
    activeLobbyId,
    liveKitConnectionState,
    mediaStats,
  });

  const videoQualityProps = useVideoQuality(mediaStats);

  const audioStatusIcon =
    audioConnectionProps.tone === "error" ? (
      <ExclamationCircleOutlined aria-hidden="true" />
    ) : audioConnectionProps.tone === "warn" ? (
      <ThunderboltOutlined aria-hidden="true" />
    ) : (
      <WifiOutlined aria-hidden="true" />
    );

  useEffect(() => {
    if (!isAudioPopupOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!audioAnchorRef.current) {
        return;
      }

      if (!audioAnchorRef.current.contains(event.target as Node)) {
        setIsAudioPopupOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsAudioPopupOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAudioPopupOpen]);

  return (
    <div className="ct-audio-connection-anchor" ref={audioAnchorRef}>
      <button
        type="button"
        className={`ct-audio-connection-card ${audioConnectionProps.tone}`}
        onClick={() => setIsAudioPopupOpen((previous) => !previous)}
        aria-expanded={isAudioPopupOpen}
        aria-label="Ses bağlantı detaylarını aç"
        title="Ses bağlantı detayları"
      >
        <span className="ct-audio-connection-icon">
          {audioStatusIcon}
        </span>
        <div className="ct-audio-connection-content">
          <span className="ct-audio-connection-text">
            {audioConnectionProps.statusText}
          </span>
        </div>
      </button>

      {isAudioPopupOpen && (
        <section
          className="ct-audio-popover ct-stagger-entry"
          role="dialog"
          aria-modal="false"
          aria-label="Ses bağlantı detayları"
        >
          <header className="ct-audio-popover-header">
            <h4>Ses Bağlantı Durumu</h4>
            <button
              type="button"
              className="ct-user-popup-close"
              onClick={() => setIsAudioPopupOpen(false)}
              aria-label="Detay penceresini kapat"
            >
              <CloseOutlined aria-hidden="true" />
            </button>
          </header>

          <p
            className={`ct-audio-popover-status ${audioConnectionProps.tone}`}
          >
            {TONE_LABELS[audioConnectionProps.tone]}
          </p>

          <div className="ct-audio-details-grid">
            <div className="ct-metric-tile">
              <span>
                <DashboardOutlined /> Gecikme (Ping)
              </span>
              <strong>
                {audioConnectionProps.pingMs !== null
                  ? `${audioConnectionProps.pingMs} ms`
                  : "-"}
              </strong>
            </div>

            <div className="ct-metric-tile">
              <span>
                <DisconnectOutlined /> Paket Kaybı
              </span>
              <strong
                className={
                  (audioConnectionProps.packetLossPct ?? 0) > 1
                    ? "alarm"
                    : undefined
                }
              >
                {audioConnectionProps.packetLossPct !== null
                  ? `${audioConnectionProps.packetLossPct.toFixed(1)}%`
                  : "%0.0"}
              </strong>
            </div>
          </div>

          {videoQualityProps.active && (
            <section
              className={`ct-video-quality ${videoQualityProps.tone}`}
              aria-label="Yayın kalitesi"
            >
              <h5>Yayın Kalitesi</h5>

              {videoQualityProps.problem && (
                <p className="ct-video-quality-problem">
                  {videoQualityProps.problem}
                </p>
              )}

              {videoQualityProps.outgoing && (
                <dl className="ct-video-quality-rows">
                  <div>
                    <dt>Gönderilen</dt>
                    <dd>
                      {videoQualityProps.outgoing.resolution}
                      {videoQualityProps.outgoing.fps !== null &&
                        ` · ${videoQualityProps.outgoing.fps} fps`}
                      {videoQualityProps.outgoing.bitrateMbps !== null &&
                        ` · ${videoQualityProps.outgoing.bitrateMbps} Mbps`}
                    </dd>
                  </div>
                  <div>
                    <dt>Kodlayıcı</dt>
                    <dd>
                      {videoQualityProps.outgoing.codec ?? "-"}
                      {videoQualityProps.outgoing.hardware === true
                        ? " · donanım"
                        : videoQualityProps.outgoing.hardware === false
                          ? " · yazılım"
                          : ""}
                      {` · ${videoQualityProps.outgoing.layerCount} katman`}
                      {videoQualityProps.outgoing.implementation !== null &&
                        ` · ${videoQualityProps.outgoing.implementation}`}
                    </dd>
                  </div>
                  {videoQualityProps.headroomMbps !== null && (
                    <div>
                      <dt>Yükleme başlık payı</dt>
                      <dd>{videoQualityProps.headroomMbps} Mbps</dd>
                    </div>
                  )}
                </dl>
              )}

              {videoQualityProps.incoming && (
                <dl className="ct-video-quality-rows">
                  <div>
                    <dt>Alınan</dt>
                    <dd>
                      {videoQualityProps.incoming.resolution}
                      {videoQualityProps.incoming.fps !== null &&
                        ` · ${videoQualityProps.incoming.fps} fps`}
                      {videoQualityProps.incoming.bitrateMbps !== null &&
                        ` · ${videoQualityProps.incoming.bitrateMbps} Mbps`}
                    </dd>
                  </div>
                  <div>
                    <dt>Donma</dt>
                    <dd
                      className={
                        (videoQualityProps.incoming.freezeCount ?? 0) > 0
                          ? "alarm"
                          : undefined
                      }
                    >
                      {videoQualityProps.incoming.freezeCount ?? 0} kez
                      {videoQualityProps.incoming.jitterBufferMs !== null &&
                        ` · ${videoQualityProps.incoming.jitterBufferMs} ms tampon`}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          )}

          <div className="ct-audio-popover-actions">
            <div className="ct-audio-toggle-row">
              <div>
                <strong>RNNoise Gürültü Bastırma</strong>
                <span>Arka plan seslerini temizler.</span>
              </div>
              <Switch
                checked={
                  audioProcessingProps.enhancedNoiseSuppressionEnabled
                }
                onChange={
                  audioProcessingProps.onToggleEnhancedNoiseSuppression
                }
                size="small"
              />
            </div>

            {audioProcessingProps.enhancedNoiseSuppressionEnabled && (
              <div
                className={`ct-ns-mode-badge ct-ns-mode-badge--${audioProcessingProps.activeNoiseMode}`}
                role="status"
                aria-live="polite"
                title="Aktif gürültü bastırma modu"
              >
                <span className="ct-ns-mode-dot" aria-hidden="true" />
                {audioProcessingProps.activeNoiseMode === "processor"
                  ? "RNNoise Filtresi Aktif"
                  : audioProcessingProps.activeNoiseMode === "browser"
                    ? "Tarayıcı Filtresi (Geri Dönüş)"
                    : audioProcessingProps.micEnabled
                      ? "Başlatılıyor..."
                      : "Mikrofon açılınca etkinleşecek"}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
