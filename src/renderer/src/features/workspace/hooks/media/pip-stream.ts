import { useSyncExternalStore } from "react";
import { Track } from "livekit-client";

/**
 * Picture-in-picture on an element React does not own.
 *
 * A tile's own <video> is the wrong thing to promote: clicking any participant
 * flips the stage between the flat grid and the focused+rail layout, and
 * leaving the lobby section unmounts the panel outright. Either one destroys
 * the element, and Chromium closes the PiP window with it — the stream simply
 * stopped as soon as the viewer touched anything else, which is the one thing
 * PiP exists to survive.
 *
 * So the PiP surface is a single detached element owned by this module. It
 * outlives every remount; the tile only says which source is in it.
 */
export type PipSource = Track | MediaStream;

let element: HTMLVideoElement | null = null;
let activeKey: string | null = null;
let detachSource: (() => void) | null = null;

const listeners = new Set<() => void>();

const publish = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const ensureElement = (): HTMLVideoElement => {
  if (element) {
    return element;
  }

  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  // Off-screen, but laid out rather than `display:none`: Chromium refuses PiP
  // on an element with no box, and adaptiveStream sizes the layer the SFU
  // sends from the element's own dimensions — a 1px element would get the
  // 180p layer and the PiP window would show mush.
  video.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1280px;height:720px;opacity:0;pointer-events:none;";
  video.addEventListener("leavepictureinpicture", () => {
    // Covers the window's own close button, not just our toggle.
    clear();
  });

  document.body.appendChild(video);
  element = video;
  return video;
};

const clear = (): void => {
  detachSource?.();
  detachSource = null;
  if (element) {
    element.srcObject = null;
  }
  if (activeKey !== null) {
    activeKey = null;
    publish();
  }
};

export const closePip = (): void => {
  if (element && document.pictureInPictureElement === element) {
    // leavepictureinpicture calls clear().
    void document.exitPictureInPicture().catch(() => clear());
    return;
  }
  clear();
};

/**
 * Put `source` in the PiP window. Must be called from a user gesture —
 * Chromium refuses otherwise, and the metadata wait below stays inside the
 * 5s transient-activation window because a live track produces metadata in
 * milliseconds.
 */
export const openPip = async (key: string, source: PipSource): Promise<void> => {
  const video = ensureElement();
  detachSource?.();
  detachSource = null;

  if (source instanceof Track) {
    source.attach(video);
    detachSource = () => source.detach(video);
  } else {
    video.srcObject = source;
  }

  // The source ending is the one case nothing else notices: the tile that
  // opened this may already be unmounted, so an ended track would otherwise
  // leave a frozen frame in a window nobody can refresh.
  const mediaTrack =
    source instanceof Track
      ? source.mediaStreamTrack
      : source.getVideoTracks()[0];
  mediaTrack?.addEventListener(
    "ended",
    () => {
      // Only if this source still owns the window — a stale listener from an
      // earlier source must not close the one that replaced it.
      if (activeKey === key) {
        closePip();
      }
    },
    { once: true },
  );

  activeKey = key;
  publish();

  void video.play().catch(() => {});

  if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });
  }

  try {
    await video.requestPictureInPicture();
  } catch {
    // Refused (no frames yet, or the gesture expired). Do not leave the button
    // claiming a window that never opened.
    clear();
  }
};

/** Which source key owns the PiP window right now, if any. */
export const usePipKey = (): string | null =>
  useSyncExternalStore(
    subscribe,
    () => activeKey,
    () => null,
  );

/** Stable identity for a tile's stream, independent of where it is rendered. */
export const pipKeyFor = (userId: string, kind: string): string =>
  `${userId}:${kind}`;
