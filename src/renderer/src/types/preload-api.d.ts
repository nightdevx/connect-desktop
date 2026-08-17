import type { DesktopApi } from "@shared/desktop-api-types";
import type { StreamingApi } from "@shared/streaming-contracts";

declare global {
  interface Window {
    desktopApi: DesktopApi;
    streaming: StreamingApi;
  }
}

export {};

// Safari's prefixed constructor, kept for the same reason Chromium still ships
// it: an AudioContext is created in three places and each of them was doing
// `(window as any).webkitAudioContext` to reach it. Declaring it once is the
// difference between one narrow, documented widening and three silent ones.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
