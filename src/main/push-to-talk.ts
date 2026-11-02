import { app, webContents, type WebContents } from "electron";
import {
  PUSH_TO_TALK_SCAN_CODES,
  createChordTracker,
  parsePushToTalkKeys,
  type ChordTracker,
} from "../shared/push-to-talk-keys";
import { loadNativeAddon } from "./utils/native-addon";

// Hold-to-talk needs the key release, which Electron's globalShortcut never
// reports. On Windows low-level hooks (native/keyboard-hook) report both for
// keys and the mouse side buttons, whichever window has focus, so the binding
// works over a full-screen game. Elsewhere, or if the hook cannot start, keys
// are read from Connect's own windows (before-input-event) and only work while
// one of them has focus; side buttons are not seen there at all.
//
// Known ceiling: a release the hook misses (secure desktop, UAC, Win+L) is
// caught by the hook's own poll, but only for a key held through one poll
// (150 ms); a shorter press with a lost release stays active until pressed
// again. Input to an elevated window is not seen at all (UIPI).

interface KeyboardHookAddon {
  start: (
    scanCodes: number[],
    callback: (scanCode: number, down: boolean) => void,
  ) => void;
  stop: () => void;
}

type PressedListener = (pressed: boolean) => void;

let addon: KeyboardHookAddon | null | undefined;
let tracker: ChordTracker | null = null;
let configuredValue: string | null = null;
let hookRunning = false;
let fallbackInstalled = false;
let listener: PressedListener = () => undefined;

const emit = (state: boolean | null): void => {
  if (state !== null) {
    listener(state);
  }
};

const loadHook = (): KeyboardHookAddon | null => {
  if (addon === undefined) {
    addon =
      process.platform === "win32"
        ? loadNativeAddon<KeyboardHookAddon>("keyboard-hook")
        : null;
  }
  return addon;
};

const watchWindowInput = (contents: WebContents): void => {
  contents.on("before-input-event", (_event, input) => {
    if (hookRunning || !tracker) {
      return;
    }
    if (input.type === "keyDown" || input.type === "keyUp") {
      emit(tracker.update(input.code, input.type === "keyDown"));
    }
  });
};

const installFallback = (): void => {
  if (fallbackInstalled) {
    return;
  }
  fallbackInstalled = true;
  webContents.getAllWebContents().forEach(watchWindowInput);
  app.on("web-contents-created", (_event, contents) => {
    watchWindowInput(contents);
  });
  // The key-up goes to whichever window has focus next, so losing focus has
  // to count as letting go -- otherwise the mic stays open.
  app.on("browser-window-blur", () => {
    if (!hookRunning && tracker?.reset()) {
      listener(false);
    }
  });
};

const startHook = (codes: string[], current: ChordTracker): boolean => {
  const native = loadHook();
  if (!native) {
    return false;
  }

  const codeByScanCode = new Map(
    codes.map((code) => [PUSH_TO_TALK_SCAN_CODES[code], code]),
  );
  try {
    native.start([...codeByScanCode.keys()], (scanCode, down) => {
      const code = codeByScanCode.get(scanCode);
      // Calls already queued by a hook that has since been replaced.
      if (code && tracker === current) {
        emit(current.update(code, down));
      }
    });
    return true;
  } catch (error) {
    console.warn(
      "[push-to-talk] keyboard hook did not start; only works while focused:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
};

// value is the stored pushToTalkKey, or null to turn push-to-talk off.
export const configurePushToTalk = (
  value: string | null,
  onPressed: PressedListener,
): void => {
  listener = onPressed;
  if (value === configuredValue) {
    return;
  }
  configuredValue = value;

  if (hookRunning) {
    addon?.stop();
    hookRunning = false;
  }
  // A binding that changes mid-press must not leave the mic open.
  if (tracker?.reset()) {
    listener(false);
  }
  tracker = null;

  const codes = parsePushToTalkKeys(value);
  if (codes.length === 0) {
    return;
  }

  const current = createChordTracker(codes);
  tracker = current;
  hookRunning = startHook(codes, current);
  if (!hookRunning) {
    installFallback();
  }
};
