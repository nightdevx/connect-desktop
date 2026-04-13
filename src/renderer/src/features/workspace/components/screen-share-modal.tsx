import type { ScreenCaptureSourceDescriptor } from "../../../../../shared/desktop-api-types";
import type {
  ScreenShareQualityOption,
  ScreenShareQualityPreset,
  ScreenShareSourceKind,
} from "../workspace-media-utils";

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
  selectedQuality: ScreenShareQualityPreset;
  qualityOptions: ScreenShareQualityOption[];
  onClose: () => void;
  onRefreshSources: () => void;
  onStart: () => void;
  onSelectSource: (sourceId: string) => void;
  onChangeKind: (kind: ScreenShareSourceKind) => void;
  onChangeQuality: (quality: ScreenShareQualityPreset) => void;
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
  onClose,
  onRefreshSources,
  onStart,
  onSelectSource,
  onChangeKind,
  onChangeQuality,
}: ScreenShareModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="ct-user-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Yayin kaynagi sec"
      onClick={onClose}
    >
      <section
        className="ct-user-popup ct-screen-share-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ct-user-popup-header">
          <h4>Yayin Baslat</h4>
          <p>Monitor veya pencere secip kalite profilini belirle.</p>
        </header>

        <div className="ct-screen-share-grid">
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
                Monitor ({monitorSources.length})
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
              <div className="ct-list-state">Kaynaklar yukleniyor...</div>
            )}

            {!isLoadingSources && activeSources.length === 0 && (
              <div className="ct-list-state error">
                {error ??
                  (sourceKind === "screen"
                    ? "Paylasilabilir monitor bulunamadi."
                    : "Paylasilabilir pencere bulunamadi.")}
              </div>
            )}

            {!isLoadingSources && activeSources.length > 0 && (
              <div className="ct-screen-share-source-list">
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
                          alt={`${source.name} onizleme`}
                        />
                      ) : (
                        <div className="ct-screen-share-source-preview-fallback">
                          Onizleme yok
                        </div>
                      )}
                    </div>
                    <div className="ct-screen-share-source-meta">
                      <strong>{source.name}</strong>
                      <span>
                        {source.kind === "screen" ? "Monitor" : "Pencere"}
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
          </div>
        </div>

        {error && activeSources.length > 0 && (
          <p className="ct-list-state error">{error}</p>
        )}

        <div className="ct-action-row">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={onStart}
            disabled={isStarting || isLoadingSources || !selectedSourceId}
          >
            {isStarting ? "Yayin Baslatiliyor..." : "Yayini Baslat"}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={onRefreshSources}
            disabled={isLoadingSources || isStarting}
          >
            Kaynaklari Yenile
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={onClose}
            disabled={isStarting}
          >
            Iptal
          </button>
        </div>
      </section>
    </div>
  );
}
