import { Modal, Button, Switch } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "../../../../../shared/desktop-api-types";
import type {
  ScreenShareQualityOption,
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
  captureSystemAudio: boolean;
  onClose: () => void;
  onRefreshSources: () => void;
  onStart: () => void;
  onSelectSource: (sourceId: string) => void;
  onChangeKind: (kind: ScreenShareSourceKind) => void;
  onChangeQuality: (quality: any) => void;
  onToggleCaptureSystemAudio: (enabled: boolean) => void;
}

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
  captureSystemAudio,
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
          <span className="text-base font-bold text-[#f5f5f5]">Yayın Başlat</span>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#8f8f8f", fontWeight: "normal" }}>
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
          style={{
            background: "rgba(25, 25, 25, 0.85)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          Kaynakları Yenile
        </Button>,
        <Button
          key="close"
          onClick={onClose}
          disabled={isStarting}
          style={{
            background: "rgba(25, 25, 25, 0.85)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          İptal
        </Button>,
        <Button
          key="start"
          type="primary"
          loading={isStarting}
          onClick={onStart}
          disabled={isStarting || isLoadingSources || !selectedSourceId}
          style={{
            background: "#ffffff",
            borderColor: "transparent",
            color: "#0b0b0b",
            fontWeight: 600,
            borderRadius: "8px",
          }}
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
      <div className="ct-screen-share-grid" style={{ margin: "20px 0" }}>
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
            <div className="ct-screen-share-source-list" style={{ maxHeight: "300px", overflowY: "auto" }}>
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
                    style={{ accentColor: "#ffffff" }}
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
            {qualityOptions.map((qualityOption) => (
              <label
                key={qualityOption.id}
                className={`ct-screen-share-quality ${selectedQuality === qualityOption.id ? "active" : ""}`}
                htmlFor={`screen-quality-${qualityOption.id}`}
              >
                <input
                  id={`screen-quality-${qualityOption.id}`}
                  type="radio"
                  name="screen-share-quality"
                  checked={selectedQuality === qualityOption.id}
                  onChange={() => onChangeQuality(qualityOption.id)}
                  style={{ accentColor: "#ffffff" }}
                />
                <div>
                  <strong>{qualityOption.label}</strong>
                  <span>{qualityOption.description}</span>
                </div>
              </label>
            ))}
          </div>

          {/* Audio Share Toggle */}
          <div
            style={{
              marginTop: "20px",
              padding: "14px 16px",
              background: captureSystemAudio
                ? "rgba(255, 255, 255, 0.06)"
                : "rgba(255, 255, 255, 0.02)",
              border: captureSystemAudio
                ? "1px solid rgba(255, 255, 255, 0.15)"
                : "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <SoundOutlined
                style={{
                  fontSize: "16px",
                  color: captureSystemAudio ? "#ffffff" : "rgba(255,255,255,0.4)",
                  transition: "color 0.2s ease",
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: captureSystemAudio ? "#ffffff" : "rgba(255,255,255,0.55)",
                    transition: "color 0.2s ease",
                    lineHeight: 1.3,
                  }}
                >
                  Yayın Sesini Paylaş
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.35)",
                    marginTop: "2px",
                    lineHeight: 1.3,
                  }}
                >
                  Ekrandaki sistem sesi diğer kullanıcılara iletilir
                </div>
              </div>
            </div>
            <Switch
              checked={captureSystemAudio}
              onChange={onToggleCaptureSystemAudio}
              size="small"
              style={{
                flexShrink: 0,
                background: captureSystemAudio ? "#52c41a" : undefined,
              }}
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
