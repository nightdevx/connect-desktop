import type { MutableRefObject } from "react";

interface CameraShareModalProps {
  isOpen: boolean;
  isPreparingPreview: boolean;
  isStarting: boolean;
  error: string | null;
  previewStream: MediaStream | null;
  previewRef: MutableRefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onRefreshPreview: () => void;
  onStart: () => void;
}

export function CameraShareModal({
  isOpen,
  isPreparingPreview,
  isStarting,
  error,
  previewStream,
  previewRef,
  onClose,
  onRefreshPreview,
  onStart,
}: CameraShareModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="ct-user-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Kamera onizleme"
      onClick={onClose}
    >
      <section
        className="ct-user-popup ct-camera-share-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ct-user-popup-header">
          <h4>Kamera Onizleme</h4>
          <p>Kamerayi lobiye gondermeden once burada kontrol et.</p>
        </header>

        <div className="ct-camera-preview-box">
          {previewStream ? (
            <video
              ref={previewRef}
              className="ct-camera-preview-video"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="ct-list-state">
              {isPreparingPreview
                ? "Kamera onizlemesi hazirlaniyor..."
                : "Onizleme hazir degil. Yenile ile tekrar dene."}
            </div>
          )}
        </div>

        {error && <p className="ct-list-state error">{error}</p>}

        <div className="ct-action-row">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={onStart}
            disabled={isPreparingPreview || isStarting || !previewStream}
          >
            {isStarting ? "Paylasiliyor..." : "Paylas"}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={onRefreshPreview}
            disabled={isPreparingPreview || isStarting}
          >
            {isPreparingPreview ? "Hazirlaniyor..." : "Yenile"}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={onClose}
            disabled={isPreparingPreview || isStarting}
          >
            Iptal
          </button>
        </div>
      </section>
    </div>
  );
}
