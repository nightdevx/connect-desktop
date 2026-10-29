// Shrinks a picture off the page's thread before it is uploaded.
//
// Decoding a phone photo and re-encoding it took a few hundred milliseconds on
// the main thread, and the settings page froze for that long. Here the decode
// is createImageBitmap and the draw is an OffscreenCanvas.
//
// Answers { blob } with the JPEG, or { blob: null } when the picture already
// fits (the caller keeps the original), or { error }.

export interface DownscaleRequest {
  file: Blob;
  maxDimension: number;
}

self.onmessage = async (event: MessageEvent<DownscaleRequest>) => {
  const { file, maxDimension } = event.data;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height || (width <= maxDimension && height <= maxDimension)) {
      bitmap.close();
      self.postMessage({ blob: null });
      return;
    }

    const scale = maxDimension / Math.max(width, height);
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      self.postMessage({ blob: null });
      return;
    }
    // JPEG has no alpha: transparent pixels would come out black, and every
    // surface clips the avatar to a circle, which hides white corners and
    // would not hide black ones.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    self.postMessage({ blob: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Görsel çözümlenemedi" });
  }
};
