import { Modal, Button, Segmented, Switch, Tooltip } from "antd";
import {
  CheckOutlined,
  DesktopOutlined,
  ReloadOutlined,
  SoundOutlined,
  WarningOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import { useMediaStatsStore } from "@/features/livekit";
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

const describeSource = (source: ScreenCaptureSourceDescriptor): string => {
  if (source.kind !== "screen") {
    return "Pencere";
  }
  return source.displayId ? `Monitör • Ekran ${source.displayId}` : "Monitör";
};

/**
 * "Yayını başlat": pick what to share, then how to send it.
 *
 * Laid out as two steps down the dialog rather than two columns beside it. The
 * old version put the source list and every encoder setting side by side, which
 * read as one wall of controls: the thing being chosen (a screen) was a 96x56
 * thumbnail wedged next to a radio button, while five quality presets each got
 * a full-width row of their own. The picture is the decision — it gets the
 * space — and the settings under it are a single row of compact fields.
 */
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
  // Congestion control's current estimate of the uplink, or null before it has
  // one. A floor rather than a ceiling — send-side BWE only probes above what
  // is already being sent — so this marks presets as risky, never blocks them.
  //
  // Read here rather than passed down: the estimate is resampled every second,
  // and threading it through the shell re-rendered the whole workspace for a
  // number that is only on screen while this dialog is open. The selector
  // returns null when it is closed, so a closed dialog never re-renders.
  const uplinkHeadroomBps = useMediaStatsStore((state) =>
    isOpen ? state.snapshot.availableOutgoingBitrateBps : null,
  );

  const selectedSource =
    activeSources.find((source) => source.id === selectedSourceId) ?? null;

  const selectedQualityOption =
    qualityOptions.find((option) => option.id === selectedQuality) ?? null;

  // 0.85 rather than 1.0: audio, retransmits and BWE's own probing all come out
  // of the same uplink, and an estimate that is exactly met is one that gets
  // missed the first time anything else moves.
  const isOverBudget = (option: ScreenShareQualityOption): boolean => {
    return (
      uplinkHeadroomBps !== null &&
      estimateScreenShareUplinkBps(option) > uplinkHeadroomBps * 0.85
    );
  };

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <>
          Yayın Başlat
          <p className="ct-modal-subtitle">
            Paylaşacağın ekranı seç, sonra nasıl gönderileceğini ayarla.
          </p>
        </>
      }
      open={isOpen}
      onCancel={onClose}
      footer={
        <div className="ct-share-footer">
          {/* What is about to happen, in one line. The dialog used to answer
              this only by which radio button happened to be filled in. */}
          <span className="ct-share-footer-summary">
            {selectedSource ? (
              <>
                <CheckOutlined className="ct-icon-success" />
                <strong>{selectedSource.name}</strong>
                {selectedQualityOption ? ` • ${selectedQualityOption.description}` : ""}
                {captureSystemAudio ? " • ses açık" : ""}
              </>
            ) : (
              "Paylaşmak için bir kaynak seç."
            )}
          </span>

          <div className="ct-share-footer-actions">
            <Button onClick={onClose} disabled={isStarting}>
              İptal
            </Button>
            <Button
              type="primary"
              loading={isStarting}
              onClick={onStart}
              disabled={isStarting || isLoadingSources || !selectedSourceId}
            >
              {isStarting ? "Başlatılıyor..." : "Yayını Başlat"}
            </Button>
          </div>
        </div>
      }
      // Wide enough for three 292px previews across: the thumbnails are what
      // this dialog is for, and at the old 760px they were postage stamps.
      width={1000}
    >
      <div className="ct-share-body">
        <section className="ct-share-step">
          <header className="ct-share-step-head">
            <h5>
              <span className="ct-share-step-index">1</span>Ne paylaşılacak?
            </h5>

            <div className="ct-share-step-tools">
              <Segmented
                value={sourceKind}
                onChange={(value) => onChangeKind(value as ScreenShareSourceKind)}
                disabled={isLoadingSources}
                options={[
                  {
                    value: "screen",
                    label: (
                      <span className="ct-segmented-option">
                        <DesktopOutlined />
                        Monitör
                        <span className="ct-segmented-count">
                          {monitorSources.length}
                        </span>
                      </span>
                    ),
                  },
                  {
                    value: "window",
                    label: (
                      <span className="ct-segmented-option">
                        <WindowsOutlined />
                        Pencere
                        <span className="ct-segmented-count">
                          {windowSources.length}
                        </span>
                      </span>
                    ),
                  },
                ]}
              />

              {/* Refreshing the list is about the list, so it lives with it
                  rather than in the footer beside "Yayını Başlat" — where it
                  was one of three buttons the user had to read before finding
                  the one that starts the share. */}
              <Tooltip title="Kaynakları yenile">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={onRefreshSources}
                  loading={isLoadingSources}
                  disabled={isStarting}
                  aria-label="Kaynakları yenile"
                />
              </Tooltip>
            </div>
          </header>

          {isLoadingSources && (
            <div className="ct-list-state">
              <p>Kaynaklar yükleniyor...</p>
            </div>
          )}

          {!isLoadingSources && activeSources.length === 0 && (
            <div className="ct-list-state error">
              <p>
                {error ??
                  (sourceKind === "screen"
                    ? "Paylaşılabilir monitör bulunamadı."
                    : "Paylaşılabilir pencere bulunamadı.")}
              </p>
            </div>
          )}

          {!isLoadingSources && activeSources.length > 0 && (
            <div className="ct-share-source-grid" role="radiogroup" aria-label="Yayın kaynağı">
              {activeSources.map((source) => {
                const isSelected = selectedSourceId === source.id;

                return (
                  <button
                    key={source.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`ct-share-source-card ${isSelected ? "active" : ""}`}
                    onClick={() => onSelectSource(source.id)}
                    title={source.name}
                  >
                    <span className="ct-share-source-thumb">
                      {source.previewDataUrl ? (
                        <img
                          src={source.previewDataUrl}
                          alt={`${source.name} önizleme`}
                        />
                      ) : (
                        <span className="ct-share-source-thumb-empty">
                          Önizleme yok
                        </span>
                      )}

                      {isSelected && (
                        <span className="ct-share-source-check">
                          <CheckOutlined />
                        </span>
                      )}
                    </span>

                    <span className="ct-share-source-name">{source.name}</span>
                    <span className="ct-share-source-kind">
                      {describeSource(source)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="ct-share-step">
          <header className="ct-share-step-head">
            <h5>
              <span className="ct-share-step-index">2</span>Nasıl gönderilsin?
            </h5>

            {uplinkHeadroomBps !== null && (
              <span className="ct-share-headroom">
                Ölçülen yükleme payı: {mbps(uplinkHeadroomBps)} Mbps
              </span>
            )}
          </header>

          <div className="ct-share-quality-row" role="radiogroup" aria-label="Kalite">
            {qualityOptions.map((option) => {
              // ponytail: marks the preset, does not switch it. Auto-downgrade
              // needs a headroom reading taken while video is actually flowing;
              // this one is measured against audio only and would under-pick.
              const overBudget = isOverBudget(option);
              const isSelected = selectedQuality === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`ct-share-quality-card ${isSelected ? "active" : ""} ${overBudget ? "over-budget" : ""}`}
                  onClick={() => onChangeQuality(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                  <span className="ct-share-quality-cost">
                    ~{mbps(estimateScreenShareUplinkBps(option))} Mbps
                    {overBudget && <WarningOutlined />}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedQualityOption && isOverBudget(selectedQualityOption) && (
            <p className="ct-inline-note">
              Bu profil ölçülen bağlantına ağır gelebilir; yayın sırasında
              düşürülebilir.
            </p>
          )}

          <div className="ct-share-options">
            {/* Content mode: decides what the encoder protects when bandwidth
                runs short — frame rate or sharpness. */}
            <div className="ct-share-option">
              <div className="ct-share-option-head">
                <strong>İçerik Türü</strong>
                <span>Bağlantı zayıflarsa neyin korunacağını seçer.</span>
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

              <p className="ct-field-hint">
                Hareket: oyun/video, akıcılık korunur. Metin: sunum/kod, netlik
                korunur.
              </p>
            </div>

            <div
              className={`ct-share-option ct-share-audio-toggle ${captureSystemAudio ? "on" : ""}`}
            >
              <div className="ct-share-audio-toggle-main">
                <SoundOutlined />
                <div className="ct-share-option-head">
                  <strong>Yayın Sesi</strong>
                  <span>Ekrandaki sistem sesi karşı tarafa iletilir.</span>
                </div>
              </div>

              <Switch
                checked={captureSystemAudio}
                onChange={onToggleCaptureSystemAudio}
              />
            </div>
          </div>
        </section>

        {error && activeSources.length > 0 && (
          <p className="ct-form-error">{error}</p>
        )}
      </div>
    </Modal>
  );
}
