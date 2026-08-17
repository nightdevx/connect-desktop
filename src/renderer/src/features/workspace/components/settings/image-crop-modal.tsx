import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Button, Modal, Slider } from "antd";
import { ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import {
  clamp,
  computeCropGeometry,
  cropRectFromGeometry,
  type CropRect,
} from "./crop-geometry";

export type { CropRect } from "./crop-geometry";

interface ImageCropModalProps {
  open: boolean;
  /** The picture as chosen, at full resolution. */
  src: string | null;
  /** Frame shape, e.g. 16 / 9 for the profile cover. */
  aspect: number;
  title: string;
  /**
   * Fires with the region the person framed, and — for anything a canvas can
   * re-encode — that region already cut out and scaled to `outputWidth`.
   *
   * A GIF gets `croppedDataURL: null`: a canvas hands back one still frame, so
   * baking the crop here would silently trade the animation for it. Those
   * travel whole and are cropped frame by frame on the server.
   */
  onApply: (rect: CropRect, croppedDataURL: string | null) => void;
  onCancel: () => void;
  /** Longest edge of the baked result. Ignored for GIFs. */
  outputWidth: number;
  /** True when the source is animated and must not go through a canvas. */
  animated: boolean;
}

// What the frame is allowed to grow to. The real width is MEASURED, not assumed
// — see the note on frameSize — but it still needs a ceiling, and this one keeps
// the dialog inside antd's default modal.
const MAX_FRAME_WIDTH = 440;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_STEP = 0.0015;

/**
 * Pan-and-zoom crop, over a frame the shape of the surface that will draw the
 * picture.
 *
 * It exists because a cover strip always crops, and centring it is a guess. A
 * 16:9 frame takes almost nothing off a photo — but "almost nothing" is still
 * somebody's head when the shot is portrait, and the only person who knows
 * which part matters is the one who chose the file.
 *
 * Zoom 1 is the picture at cover size: the smallest it can be and still fill
 * the frame, so there is no zoom level at which a gap can appear. Panning is
 * clamped to the same rule, which is why there is no "empty" state to design.
 *
 * Layout and arithmetic come from ONE place on purpose. The first version let
 * CSS centre the picture and computed the crop from a hard-coded frame width,
 * so the two agreed only as long as nothing about the dialog changed size — and
 * zooming in, which is exactly when the picture stops fitting, is where they
 * came apart. The image is now positioned explicitly from the same numbers the
 * rectangle is derived from, and the frame is measured rather than assumed.
 */
export function ImageCropModal({
  open,
  src,
  aspect,
  title,
  onApply,
  onCancel,
  outputWidth,
  animated,
}: ImageCropModalProps): ReactElement {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({
    width: MAX_FRAME_WIDTH,
    height: MAX_FRAME_WIDTH / aspect,
  });

  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );

  // A new picture starts centred at cover size. Without this the second file
  // somebody picks opens framed by the gesture they made on the first.
  useEffect(() => {
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  // The frame's real size, because a modal that is narrower than MAX_FRAME_WIDTH
  // shrinks it and every number below is in frame pixels.
  const attachFrame = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    if (!node) {
      return;
    }

    const measure = (): void => {
      const box = node.getBoundingClientRect();
      setFrameSize((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { width: box.width, height: box.height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // The callback ref runs again with null on unmount, which is where this
    // would be disconnected — but a ResizeObserver on a detached node is
    // already inert, so letting it fall out of scope is enough.
  }, []);

  // Every number the dialog draws with and every number it reads back come from
  // this one call. See crop-geometry.ts for why that matters.
  const geometry = natural
    ? computeCropGeometry(natural, frameSize, zoom, offset)
    : null;
  const displayedWidth = geometry?.displayedWidth ?? 0;
  const displayedHeight = geometry?.displayedHeight ?? 0;
  const maxOffsetX = geometry?.maxOffsetX ?? 0;
  const maxOffsetY = geometry?.maxOffsetY ?? 0;

  const clampOffset = useCallback(
    (next: { x: number; y: number }) => ({
      x: clamp(next.x, -maxOffsetX, maxOffsetX),
      y: clamp(next.y, -maxOffsetY, maxOffsetY),
    }),
    [maxOffsetX, maxOffsetY],
  );

  // Re-clamped whenever the bounds shrink, which is what zooming out does. Skip
  // the write when nothing moved, or this loops against its own state.
  useEffect(() => {
    setOffset((previous) => {
      const next = clampOffset(previous);
      return next.x === previous.x && next.y === previous.y ? previous : next;
    });
  }, [clampOffset]);

  // Where the picture's top-left corner actually sits inside the frame. This is
  // both what gets rendered and what the rectangle is read back from, so the two
  // cannot disagree.
  const imageLeft = geometry?.imageLeft ?? 0;
  const imageTop = geometry?.imageTop ?? 0;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Pointer capture, so a drag that leaves the frame keeps tracking instead of
    // sticking the picture wherever the cursor crossed the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: offset.x,
      y: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = dragOrigin.current;
    if (!origin) {
      return;
    }

    setOffset(
      clampOffset({
        x: origin.x + (event.clientX - origin.pointerX),
        y: origin.y + (event.clientY - origin.pointerY),
      }),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    setZoom((previous) => clamp(previous - event.deltaY * WHEEL_ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
  };

  // An <img> that was already decoded fires load before React attaches the
  // handler, which used to leave `natural` null and the Apply button dead.
  const readNaturalSize = (element: HTMLImageElement | null): void => {
    if (!element || !element.complete || !element.naturalWidth) {
      return;
    }

    setNatural((previous) =>
      previous &&
      previous.width === element.naturalWidth &&
      previous.height === element.naturalHeight
        ? previous
        : { width: element.naturalWidth, height: element.naturalHeight },
    );
  };

  const buildRect = (): CropRect | null =>
    natural && geometry ? cropRectFromGeometry(natural, frameSize, geometry) : null;

  const handleApply = (): void => {
    const rect = buildRect();
    if (!rect || !src || !natural) {
      return;
    }

    if (animated) {
      onApply(rect, null);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth / aspect);
    const context = canvas.getContext("2d");
    if (!context) {
      // Nothing to fall back to but the uncropped picture; the server still
      // bounds it, and a lost crop is better than a lost upload.
      onApply(rect, null);
      return;
    }

    const image = document.createElement("img");
    image.onload = () => {
      // Cut from the FULL-resolution original rather than from the preview:
      // the frame is a few hundred pixels wide and the output is 1024, so
      // scaling up what was on screen would throw away pixels still in hand.
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        rect.x * natural.width,
        rect.y * natural.height,
        rect.width * natural.width,
        rect.height * natural.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      onApply(rect, canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => onApply(rect, null);
    image.src = src;
  };

  return (
    <Modal
      rootClassName="ct-modal"
      title={title}
      open={open}
      onCancel={onCancel}
      okText="Uygula"
      cancelText="İptal"
      onOk={handleApply}
      okButtonProps={{ disabled: !natural }}
      destroyOnHidden
    >
      <div className="ct-crop-modal">
        <div
          ref={attachFrame}
          className="ct-crop-frame"
          style={{ width: MAX_FRAME_WIDTH, aspectRatio: aspect }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
        >
          {src && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="ct-crop-image"
              ref={readNaturalSize}
              style={{
                width: displayedWidth || undefined,
                height: displayedHeight || undefined,
                transform: `translate(${imageLeft}px, ${imageTop}px)`,
              }}
              onLoad={(event) => readNaturalSize(event.currentTarget)}
            />
          )}
        </div>

        <div className="ct-crop-controls">
          <Button
            type="text"
            icon={<ZoomOutOutlined />}
            onClick={() => setZoom((previous) => clamp(previous - 0.2, MIN_ZOOM, MAX_ZOOM))}
            aria-label="Uzaklaştır"
          />
          <Slider
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={setZoom}
            tooltip={{ formatter: (value) => `${Math.round((value ?? 1) * 100)}%` }}
          />
          <Button
            type="text"
            icon={<ZoomInOutlined />}
            onClick={() => setZoom((previous) => clamp(previous + 0.2, MIN_ZOOM, MAX_ZOOM))}
            aria-label="Yakınlaştır"
          />
        </div>

        <small className="ct-crop-hint">
          Sürükleyerek konumlandır, tekerlek veya kaydırıcıyla büyüt. Çerçevenin
          içinde kalan kısım gösterilir.
        </small>
      </div>
    </Modal>
  );
}
