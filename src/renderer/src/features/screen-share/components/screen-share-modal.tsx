import { Modal, Button, Segmented, Switch } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import { estimateScreenShareUplinkBps } from "../constants";
import type {
  ScreenShareContentMode,
  ScreenShareQualityOption,
  ScreenShareQualityPreset,
  ScreenShareSourceKind,
} from "../types";

interface ScreenShareModalProps {
  isOpen: boolean;
  isLoadingSources: boolean;
  isStarting: boolean;
  error: string | null;
  sourceKind: ScreenShareSourceKind;
  monitorSources: ScreenCaptureSourceDescriptor[];
  windowSources: ScreenCaptureSourceDescriptor[];
  activeSources: ScreenCaptureSourceDescriptor[];
  selectedSourceId: string | null;
  selectedQuality: string;
  qualityOptions: ScreenShareQualityOption[];
  contentMode: ScreenShareContentMode;
  captureSystemAudio: boolean;
  /**
   * Congestion control's current estimate of the uplink, or null before it has
   * one. It is a floor rather than a ceiling — send-side BWE only probes above
   * what is already being sent — so this marks presets as risky, never blocks
   * them.
   */
  uplinkHeadroomBps: number | null;
  onChangeContentMode: (mode: ScreenShareContentMode) => void;
  onClose: () => void;
  onRefreshSources: () => void;
  onStart: () => void;
  onSelectSource: (sourceId: string) => void;
  onChangeKind: (kind: ScreenShareSourceKind) => void;
  onChangeQuality: (quality: ScreenShareQualityPreset) => void;
  onToggleCaptureSystemAudio: (enabled: boolean) => void;
}

const mbps = (bps: number): string => {
  return (bps / 1_000_000).toFixed(1);
};

export function ScreenShareModal({
  isOpen,
  isLoadingSources,
  isStarting,
  error,
  sourceKind,
  monitorSources,
  windowSources,
  activeSources,
  selectedSourceId,
  selectedQuality,
  qualityOptions,
  contentMode,
  captureSystemAudio,
  uplinkHeadroomBps,
  onChangeContentMode,
  onClose,
  onRefreshSources,
  onStart,
  onSelectSource,
  onChangeKind,
  onChangeQuality,
  onToggleCaptureSystemAudio,
}: ScreenShareModalProps) {
  return (
    <Modal
      title={
        <div>
          <span className="text-base font-bold text-ct-text-primary">Yayın Başlat</span>
          <p className="ct-modal-subtitle">
            Monitör veya pencere seçip kalite profilini belirle.
          </p>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      footer={[
        <Button
          key="refresh"
          onClick={onRefreshSources}
          disabled={isLoadingSources || isStarting}
          
        >
          Kaynakları Yenile
        </Button>,
        <Button
          key="close"
          onClick={onClose}
          disabled={isStarting}
          
        >
          İptal
        </Button>,
        <Button
          key="start"
          type="primary"
          loading={isStarting}
          onClick={onStart}
          disabled={isStarting || isLoadingSources || !selectedSourceId}
          
        >
          {isStarting ? "Yayın Başlatılıyor..." : "Yayını Başlat"}
        </Button>,
      ]}
      styles={{
        mask: {
          backdropFilter: "blur(6px)",
          background: "rgba(0, 0, 0, 0.7)",
        },
      }}
      width={760}
    >
      <div className="ct-screen-share-grid" >
        <div className="ct-screen-share-column">
          <h5>Kaynak</h5>

          <div className="ct-screen-share-kind-tabs">
            <button
              type="button"
              className={`ct-screen-share-kind-tab ${sourceKind === "screen" ? "active" : ""}`}
              onClick={() => {
                onChangeKind("screen");
              }}
              disabled={isLoadingSources}
            >
              Monitör ({monitorSources.length})
            </button>
            <button
              type="button"
              className={`ct-screen-share-kind-tab ${sourceKind === "window" ? "active" : ""}`}
              onClick={() => {
                onChangeKind("window");
              }}
              disabled={isLoadingSources}
            >
              Pencere ({windowSources.length})
            </button>
          </div>

          {isLoadingSources && (
            <div className="ct-list-state">Kaynaklar yükleniyor...</div>
          )}

          {!isLoadingSources && activeSources.length === 0 && (
            <div className="ct-list-state error">
              {error ??
                (sourceKind === "screen"
                  ? "Paylaşılabilir monitör bulunamadı."
                  : "Paylaşılabilir pencere bulunamadı.")}
            </div>
          )}

          {!isLoadingSources && activeSources.length > 0 && (
            <div className="ct-screen-share-source-list ct-share-source-scroll">
              {activeSources.map((source) => (
                <label
                  key={source.id}
                  className={`ct-screen-share-source ${selectedSourceId === source.id ? "active" : ""}`}
                  htmlFor={`screen-source-${source.id}`}
                >
                  <input
                    id={`screen-source-${source.id}`}
                    type="radio"
                    name="screen-share-source"
                    checked={selectedSourceId === source.id}
                    onChange={() => onSelectSource(source.id)}
                    
                  />
                  <div className="ct-screen-share-source-preview">
                    {source.previewDataUrl ? (
                      <img
                        src={source.previewDataUrl}
                        alt={`${source.name} önizleme`}
                      />
                    ) : (
                      <div className="ct-screen-share-source-preview-fallback">
                        Önizleme yok
                      </div>
                    )}
                  </div>
                  <div className="ct-screen-share-source-meta">
                    <strong>{source.name}</strong>
                    <span>
                      {source.kind === "screen" ? "Monitör" : "Pencere"}
                      {source.displayId ? ` • Ekran ${source.displayId}` : ""}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="ct-screen-share-column">
          <h5>Kalite</h5>
          <div className="ct-screen-share-quality-list">
            {qualityOptions.map((qualityOption) => {
              // ponytail: marks the preset, does not switch it. Auto-downgrade
              // needs a headroom reading taken while video is actually flowing;
              // this one is measured against audio only and would under-pick.
              const requiredBps = estimateScreenShareUplinkBps(qualityOption);
              // 0.85 rather than 1.0: audio, retransmits and BWE's own probing
              // all come out of the same uplink, and an estimate that is exactly
              // met is one that gets missed the first time anything else moves.
              const overBudget =
                uplinkHeadroomBps !== null &&
                requiredBps > uplinkHeadroomBps * 0.85;

              return (
                <label
                  key={qualityOption.id}
                  className={`ct-screen-share-quality ${selectedQuality === qualityOption.id ? "active" : ""} ${overBudget ? "over-budget" : ""}`}
                  htmlFor={`screen-quality-${qualityOption.id}`}
                >
                  <input
                    id={`screen-quality-${qualityOption.id}`}
                    type="radio"
                    name="screen-share-quality"
                    checked={selectedQuality === qualityOption.id}
                    onChange={() => onChangeQuality(qualityOption.id)}
                  />
                  <div>
                    <strong>{qualityOption.label}</strong>
                    <span>
                      {qualityOption.description} • ~{mbps(requiredBps)} Mbps
                      {overBudget ? " • bağlantına ağır gelebilir" : ""}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          {uplinkHeadroomBps !== null && (
            <div className="ct-field-hint">
              Ölçülen yükleme başlık payı: {mbps(uplinkHeadroomBps)} Mbps.
              Gösterilen değerler tüm katmanların toplamıdır.
            </div>
          )}

          {/* Content mode: decides what the encoder protects when bandwidth
              runs short — frame rate or sharpness. */}
          <div >
            <div
              className="ct-field-label"
            >
              İçerik Türü
            </div>
            <Segmented
              block
              value={contentMode}
              onChange={(value) =>
                onChangeContentMode(value as ScreenShareContentMode)
              }
              options={[
                { label: "Otomatik", value: "auto" },
                { label: "Hareket", value: "motion" },
                { label: "Metin", value: "detail" },
              ]}
            />
            <div
              className="ct-field-hint"
            >
              Hareket: oyun/video, bağlantı zayıflarsa akıcılık korunur.
              Metin: sunum/kod, çözünürlük ve netlik korunur.
            </div>
          </div>

          {/* Audio Share Toggle */}
          <div
            className={`ct-share-audio-toggle ${captureSystemAudio ? "on" : ""}`}
          >
            <div className="ct-share-audio-toggle-main">
              <SoundOutlined />
              <div>
                <strong>Yayın Sesini Paylaş</strong>
                <span className="ct-field-hint">
                  Ekrandaki sistem sesi diğer kullanıcılara iletilir
                </span>
              </div>
            </div>
            <Switch
              checked={captureSystemAudio}
              onChange={onToggleCaptureSystemAudio}
              size="small"
            />
          </div>
        </div>
      </div>

      {error && activeSources.length > 0 && (
        <p className="ct-list-state error">{error}</p>
      )}
    </Modal>
  );
}
