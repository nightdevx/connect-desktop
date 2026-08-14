import type { MutableRefObject } from "react";
import { Modal, Button } from "antd";

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
  return (
    <Modal
      title={
        <div>
          <span className="text-base font-bold text-[#f5f5f5]">Kamera Önizleme</span>
          <p className="ct-modal-subtitle">
            Kamerayı lobiye göndermeden önce burada kontrol et.
          </p>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      footer={[
        <Button
          key="refresh"
          onClick={onRefreshPreview}
          disabled={isPreparingPreview || isStarting}
          
        >
          {isPreparingPreview ? "Hazırlanıyor..." : "Yenile"}
        </Button>,
        <Button
          key="close"
          onClick={onClose}
          disabled={isPreparingPreview || isStarting}
          
        >
          İptal
        </Button>,
        <Button
          key="start"
          type="primary"
          loading={isStarting}
          onClick={onStart}
          disabled={isPreparingPreview || isStarting || !previewStream}
          
        >
          {isStarting ? "Paylaşılıyor..." : "Paylaş"}
        </Button>
      ]}
      styles={{
        mask: {
          backdropFilter: "blur(6px)",
          background: "rgba(0, 0, 0, 0.7)",
        },
      }}
      width={500}
    >
      <div className="ct-camera-preview-box" >
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
              ? "Kamera önizlemesi hazırlanıyor..."
              : "Önizleme hazır değil. Yenile ile tekrar dene."}
          </div>
        )}
      </div>

      {error && <p className="ct-list-state error">{error}</p>}
    </Modal>
  );
}


