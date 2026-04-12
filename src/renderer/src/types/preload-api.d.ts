import type { DesktopApi } from "../../../shared/desktop-api-types";
import type { StreamingApi } from "../../../shared/streaming-contracts";

declare global {
  interface Window {
    desktopApi: DesktopApi;
    streaming: StreamingApi;
  }
}

export {};
