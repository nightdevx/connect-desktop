import { Modal, Button, Segmented, Switch } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "../../../../../shared/desktop-api-types";
import type {
  ScreenShareContentMode,
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
  contentMode: ScreenShareContentMode;
  captureSystemAudio: boolean;
  onChangeContentMode: (mode: ScreenShareContentMode) => void;
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
  contentMode,
  captureSystemAudio,
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
          <span className="text-base font-bold text-[#f5f5f5]">Yayın Başlat</span>
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
                  
                />
                <div>
                  <strong>{qualityOption.label}</strong>
                  <span>{qualityOption.description}</span>
                </div>
              </label>
            ))}
          </div>

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
