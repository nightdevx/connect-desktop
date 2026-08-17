import { useMemo, useSyncExternalStore } from "react";
import { useWindowActive } from "./use-window-active";

/**
 * Freezing animated profile pictures while the window is in the background.
 *
 * An animated GIF in an <img> decodes and repaints forever, and nothing in CSS
 * or the DOM can pause one — `animation-play-state` governs CSS animations, not
 * image frames. The only lever is the `src`, so this swaps in a single still
 * frame and swaps the animation back when the window is focused again.
 *
 * It costs one canvas decode per distinct picture, once, and only for pictures
 * that are actually animated. Everything else is returned untouched with no
 * work at all — which is almost every avatar on screen.
 */

// Bounded because the key is a data URL and the value is another one, so an
// unbounded map would keep every GIF anybody has ever had on screen. Sixty is
// far above what one session shows; past it the oldest is dropped and would
// simply be redrawn if it came back.
const MAX_CACHED_STILLS = 60;

const stills = new Map<string, string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

// What the hooks below subscribe to, and it is a NUMBER on purpose.
//
// useSyncExternalStore compares snapshots with Object.is and re-renders when
// they differ, so a getSnapshot that builds a fresh array is an infinite loop —
// React even says so by name. Subscribing to a counter and deriving the value in
// a useMemo keeps the snapshot stable and the derivation cached.
let version = 0;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getVersion = (): number => version;

const publish = (): void => {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
};

export const isAnimatedImageSource = (src: string | null | undefined): boolean =>
  typeof src === "string" && src.startsWith("data:image/gif");

const remember = (src: string, still: string): void => {
  if (stills.size >= MAX_CACHED_STILLS) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = stills.keys().next().value;
    if (oldest !== undefined) {
      stills.delete(oldest);
    }
  }
  stills.set(src, still);
};

const freeze = (src: string): void => {
  if (inFlight.has(src) || stills.has(src)) {
    return;
  }
  inFlight.add(src);

  const image = document.createElement("img");
  image.onload = () => {
    inFlight.delete(src);

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) {
      return;
    }

    context.drawImage(image, 0, 0);
    // PNG, not JPEG: a GIF avatar is very often cut out with a transparent
    // background, and JPEG has no alpha — the still would come back with black
    // corners the animation does not have.
    remember(src, canvas.toDataURL("image/png"));
    publish();
  };
  image.onerror = () => {
    inFlight.delete(src);
  };
  image.src = src;
};

/**
 * Resolve one source. Returns the original until the still has been drawn, so a
 * picture never blanks — the worst case is that it animates for a moment longer
 * after the window loses focus.
 */
const resolve = (
  src: string | null | undefined,
  active: boolean,
): string | null | undefined => {
  if (active || !isAnimatedImageSource(src)) {
    return src;
  }

  const cached = stills.get(src as string);
  if (cached) {
    return cached;
  }

  freeze(src as string);
  return src;
};

/** The `src` to render right now, for a single picture. */
export const useStillImage = (
  src: string | null | undefined,
): string | null | undefined => {
  const active = useWindowActive();
  const stillVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  // stillVersion is not read in the body and that is the point: the body reads
  // the module-level cache, which is mutable, and this is the only thing that
  // says it changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolve(src, active), [src, active, stillVersion]);
};

/**
 * The same for a whole roster, as one subscription instead of one per row.
 *
 * Returns the SAME array when nothing froze, so every memo downstream keeps its
 * cached result rather than recomputing on each render.
 */
export const useStillImages = (
  sources: (string | null | undefined)[],
): (string | null | undefined)[] => {
  const active = useWindowActive();
  const stillVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  return useMemo(() => {
    if (active) {
      return sources;
    }

    let changed = false;
    const next = sources.map((src) => {
      const resolved = resolve(src, active);
      if (resolved !== src) {
        changed = true;
      }
      return resolved;
    });

    return changed ? next : sources;
    // See the note above: stillVersion invalidates a read of the mutable cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, active, stillVersion]);
};
