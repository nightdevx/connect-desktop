/**
 * The arithmetic behind the crop dialog, on its own so it can be checked.
 *
 * It was wrong twice. The first version hard-coded the frame width and let CSS
 * centre the picture, so layout and arithmetic came from two places that agreed
 * only while nothing changed size — and zooming in, which is precisely when the
 * picture stops fitting the frame, is where they came apart.
 *
 * So there is one rule now, and everything is derived from it: the picture's
 * top-left corner sits at `imageLeft, imageTop` inside the frame. That is what
 * gets rendered, and the crop rectangle is read straight back out of it.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropGeometry {
  /** The smallest scale at which the picture still covers the frame. */
  coverScale: number;
  effectiveScale: number;
  displayedWidth: number;
  displayedHeight: number;
  /** How far the picture may travel before an edge comes inside the frame. */
  maxOffsetX: number;
  maxOffsetY: number;
  imageLeft: number;
  imageTop: number;
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

export const computeCropGeometry = (
  natural: Size,
  frame: Size,
  zoom: number,
  offset: Offset,
): CropGeometry => {
  const coverScale = Math.max(
    frame.width / natural.width,
    frame.height / natural.height,
  );
  const effectiveScale = coverScale * zoom;
  const displayedWidth = natural.width * effectiveScale;
  const displayedHeight = natural.height * effectiveScale;

  const maxOffsetX = Math.max(0, (displayedWidth - frame.width) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - frame.height) / 2);

  // Clamped here rather than by the caller, so a rectangle can never be read
  // out of a position the picture is not allowed to be in.
  const boundedX = clamp(offset.x, -maxOffsetX, maxOffsetX);
  const boundedY = clamp(offset.y, -maxOffsetY, maxOffsetY);

  return {
    coverScale,
    effectiveScale,
    displayedWidth,
    displayedHeight,
    maxOffsetX,
    maxOffsetY,
    imageLeft: (frame.width - displayedWidth) / 2 + boundedX,
    imageTop: (frame.height - displayedHeight) / 2 + boundedY,
  };
};

/**
 * The framed region, as fractions of the source.
 *
 * imageLeft is negative whenever the picture overhangs the frame, which is what
 * makes its negation the offset INTO the source rather than out of it.
 */
export const cropRectFromGeometry = (
  natural: Size,
  frame: Size,
  geometry: CropGeometry,
): CropRect => ({
  x: clamp(-geometry.imageLeft / geometry.effectiveScale / natural.width, 0, 1),
  y: clamp(-geometry.imageTop / geometry.effectiveScale / natural.height, 0, 1),
  width: clamp(frame.width / geometry.effectiveScale / natural.width, 0, 1),
  height: clamp(frame.height / geometry.effectiveScale / natural.height, 0, 1),
});
