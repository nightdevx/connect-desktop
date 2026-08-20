import type { MutableRefObject } from "react";
import { Modal, Button, Segmented, Tooltip } from "antd";
import {
  CheckOutlined,
  LoadingOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { CameraPreferences } from "../settings/settings-main-panel-types";

interface CameraShareModalProps {
  isOpen: boolean;
  isPreparingPreview: boolean;
  isStarting: boolean;
  error: string | null;
  previewStream: MediaStream | null;
  previewRef: MutableRefObject<HTMLVideoElement | null>;
  /** The same preferences Ayarlar → Kamera writes; changing them here saves. */
  cameraPreferences: CameraPreferences;
  onChangeCameraPreferences: (next: CameraPreferences) => void;
  onClose: () => void;
  onRefreshPreview: () => void;
  onStart: () => void;
}

/**
 * "Kamerayı paylaş": look at yourself, then say how it should be sent.
 *
 * Laid out as the same two steps as the screen-share dialog, because it is the
 * same decision made about a different source. It used to be a preview box and
 * three footer buttons with no settings at all: the resolution and framerate it
 * published at lived in Ayarlar → Kamera, four clicks away and on a screen that
 * does not show a preview — so the one moment somebody can SEE what a setting
 * does was the one moment they could not reach it.
 */
export function CameraShareModal({
  isOpen,
  isPreparingPreview,
  isStarting,
  error,
  previewStream,
  previewRef,
  cameraPreferences,
  onChangeCameraPreferences,
  onClose,
  onRefreshPreview,
  onStart,
}: CameraShareModalProps) {
  const isBusy = isPreparingPreview || isStarting;

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <>
          Kamerayı Paylaş
          <p className="ct-modal-subtitle">
            Görüntünü kontrol et, sonra nasıl gönderileceğini seç.
          </p>
        </>
      }
      open={isOpen}
      onCancel={onClose}
      footer={
        <div className="ct-share-footer">
          <span className="ct-share-footer-summary">
            {previewStream ? (
              <>
                <CheckOutlined className="ct-icon-success" />
                <strong>Kamera hazır</strong>
                {` • ${cameraPreferences.resolution} • ${cameraPreferences.frameRate} FPS`}
              </>
            ) : isPreparingPreview ? (
              "Önizleme hazırlanıyor…"
            ) : (
              "Önizleme hazır değil."
            )}
          </span>

          <div className="ct-share-footer-actions">
            <Button onClick={onClose} disabled={isBusy}>
              İptal
            </Button>
            <Button
              type="primary"
              loading={isStarting}
              onClick={onStart}
              disabled={isBusy || !previewStream}
            >
              {isStarting ? "Paylaşılıyor..." : "Paylaş"}
            </Button>
          </div>
        </div>
      }
      width={560}
      destroyOnHidden
    >
      <div className="ct-share-body">
        <section className="ct-share-step">
          <header className="ct-share-step-head">
            <h5>
              <span className="ct-share-step-index">1</span>Önizleme
            </h5>

            <div className="ct-share-step-tools">
              <Tooltip title="Önizlemeyi yenile">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={onRefreshPreview}
                  loading={isPreparingPreview}
                  disabled={isStarting}
                  aria-label="Önizlemeyi yenile"
                />
              </Tooltip>
            </div>
          </header>

          {/* One box, always the same shape. The video is kept MOUNTED whatever
              the state is -- the hook hands its stream to this element through a
              ref, and unmounting it on every state flip is how a preview ends up
              black after a refresh. The overlay covers it instead. */}
          <div className="ct-camera-preview-box">
            <video
              ref={previewRef}
              className="ct-camera-preview-video"
              autoPlay
              muted
              playsInline
            />

            {!previewStream && (
              <div className="ct-camera-preview-state">
                {isPreparingPreview ? (
                  <>
                    <LoadingOutlined />
                    <p>Kamera önizlemesi hazırlanıyor…</p>
                  </>
                ) : (
                  <>
                    <VideoCameraOutlined />
                    <p>Önizleme hazır değil. Yenile ile tekrar dene.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {error && <p className="ct-form-error">{error}</p>}
        </section>

        <section className="ct-share-step">
          <header className="ct-share-step-head">
            <h5>
              <span className="ct-share-step-index">2</span>Nasıl gönderilsin?
            </h5>
          </header>

          <div className="ct-share-options">
            <div className="ct-share-option">
              <div className="ct-share-option-head">
                <strong>Çözünürlük</strong>
                <span>1080p daha net; zayıf bağlantıda 720p daha kararlı.</span>
              </div>

              <Segmented
                block
                value={cameraPreferences.resolution}
                disabled={isBusy}
                onChange={(value) =>
                  onChangeCameraPreferences({
                    ...cameraPreferences,
                    resolution: value as CameraPreferences["resolution"],
                  })
                }
                options={[
                  { label: "720p", value: "720p" },
                  { label: "1080p", value: "1080p" },
                ]}
              />
            </div>

            <div className="ct-share-option">
              <div className="ct-share-option-head">
                <strong>Kare Hızı</strong>
                <span>30 daha akıcı; 24 daha az bant genişliği harcar.</span>
              </div>

              <Segmented
                block
                value={cameraPreferences.frameRate}
                disabled={isBusy}
                onChange={(value) =>
                  onChangeCameraPreferences({
                    ...cameraPreferences,
                    frameRate: value as CameraPreferences["frameRate"],
                  })
                }
                options={[
                  { label: "24 FPS", value: 24 },
                  { label: "30 FPS", value: 30 },
                ]}
              />
            </div>
          </div>

          {/* Both controls write the same stored preference Ayarlar → Kamera
              does, and the preview restarts on the new constraints — so what is
              on screen is what the room will get. */}
          <p className="ct-field-hint">
            Bu seçimler Ayarlar → Kamera ile aynı yeri yazar ve önizleme yeni
            ayarla yeniden başlar.
          </p>
        </section>
      </div>
    </Modal>
  );
}
