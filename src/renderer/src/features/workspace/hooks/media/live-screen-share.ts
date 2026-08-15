import type { ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import type {
  ScreenShareFrameRate,
  ScreenShareQualityPreset,
} from "@/features/screen-share";

export type { ScreenShareFrameRate };

/**
 * What the toolbar's stream menu is allowed to do to a share that is already
 * running. Everything here mutates the live publication; nothing starts or
 * stops one.
 */
export interface LiveScreenShareControls {
  getQuality: () => ScreenShareQualityPreset;
  getFrameRate: () => ScreenShareFrameRate;
  getSourceId: () => string | null;
  listSources: () => Promise<ScreenCaptureSourceDescriptor[]>;
  changeQuality: (quality: ScreenShareQualityPreset) => Promise<void>;
  changeFrameRate: (frameRate: ScreenShareFrameRate) => Promise<void>;
  changeSource: (sourceId: string) => Promise<void>;
}

// ponytail: a module-level slot rather than a React context. There is one
// screen share per app and useWorkspaceMediaControls is instantiated exactly
// once (WorkspaceShell), so a provider would buy nothing but a prop chain
// through four components. Lift it to context if a second, independent share
// ever exists.
let activeControls: LiveScreenShareControls | null = null;

export const registerLiveScreenShareControls = (
  controls: LiveScreenShareControls,
): (() => void) => {
  activeControls = controls;
  return () => {
    if (activeControls === controls) {
      activeControls = null;
    }
  };
};

export const getLiveScreenShareControls = (): LiveScreenShareControls | null => {
  return activeControls;
};
