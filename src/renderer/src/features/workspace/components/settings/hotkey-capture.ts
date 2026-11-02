import { useEffect, useRef, useState } from "react";
import {
  MAX_PUSH_TO_TALK_KEYS,
  isPushToTalkKey,
} from "@shared/push-to-talk-keys";

const isMac = window.desktopApi.platform === "darwin";

// Electron accelerators name modifiers differently from KeyboardEvent, and
// nobody should have to type "CommandOrControl+Shift+M" by hand. On macOS
// Command and Control are two keys, and CommandOrControl means Command there.
const toAccelerator = (event: KeyboardEvent): string | null => {
  const parts: string[] = [];
  if (isMac) {
    if (event.metaKey) parts.push("CommandOrControl");
    if (event.ctrlKey) parts.push("Control");
  } else if (event.ctrlKey || event.metaKey) {
    parts.push("CommandOrControl");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const code = event.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (code === "Space") key = "Space";

  if (!key) {
    return null;
  }

  // A bare letter would swallow that key for every application on the machine.
  if (parts.length === 0 && !/^F\d/.test(key)) {
    return null;
  }

  parts.push(key);
  return parts.join("+");
};

// What is stored is for Electron and KeyboardEvent; what is shown is what is
// printed on the keys: "CommandOrControl+Shift+M" reads "Ctrl + Shift + M"
// (on macOS "⌘ + Shift + M"), "KeyV" reads "V".
export const formatHotkey = (value: string): string =>
  value
    .split("+")
    .map((part) =>
      part === "CommandOrControl"
        ? isMac
          ? "⌘"
          : "Ctrl"
        : isMac && part === "Alt"
          ? "Option"
          : part.replace(/^Key(?=[A-Z]$)/, "").replace(/^Digit(?=\d$)/, ""),
    )
    .join(" + ");

interface CaptureHandlers {
  onCommit: (value: string) => void;
  onCancel: () => void;
  onClear: () => void;
}

// Records one Electron accelerator ("CommandOrControl+Shift+M") on key-down.
export const useAcceleratorCapture = ({
  active,
  ...handlers
}: CaptureHandlers & { active: boolean }): void => {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        handlersRef.current.onCancel();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        handlersRef.current.onClear();
        return;
      }
      const accelerator = toAccelerator(event);
      if (accelerator) {
        handlersRef.current.onCommit(accelerator);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [active]);
};

// Keys that print nothing, named the way they are printed on the keycap.
const KEY_LABELS: Record<string, string> = {
  ControlLeft: "Sol Ctrl",
  ControlRight: "Sağ Ctrl",
  ShiftLeft: "Sol Shift",
  ShiftRight: "Sağ Shift",
  AltLeft: isMac ? "Sol Option" : "Alt",
  AltRight: isMac ? "Sağ Option" : "AltGr",
  MetaLeft: isMac ? "Sol ⌘" : "Win",
  MetaRight: isMac ? "Sağ ⌘" : "Sağ Win",
  Escape: "Esc",
  CapsLock: "Caps Lock",
  PageUp: "Page Up",
  PageDown: "Page Down",
  PrintScreen: "Print Screen",
  ScrollLock: "Scroll Lock",
  NumLock: "Num Lock",
  ContextMenu: "Menü",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse4: "Fare 4",
  Mouse5: "Fare 5",
};

type LayoutMap = ReadonlyMap<string, string>;

// The browser knows what the user's own layout prints on each key, so a Turkish
// Q board reads "Ş" where the code says "Semicolon". Without it (an old
// runtime, a denied permission) the code is shown cleaned up instead.
export const useKeyboardLayout = (): LayoutMap | null => {
  const [layout, setLayout] = useState<LayoutMap | null>(null);

  useEffect(() => {
    const keyboard = (
      navigator as Navigator & {
        keyboard?: { getLayoutMap?: () => Promise<LayoutMap> };
      }
    ).keyboard;
    let active = true;
    keyboard
      ?.getLayoutMap?.()
      .then((map) => {
        if (active) setLayout(map);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return layout;
};

const formatKey = (code: string, layout: LayoutMap | null): string => {
  const label = KEY_LABELS[code];
  if (label) return label;
  if (code === "Space") return "Space";

  const printed = layout?.get(code);
  if (printed && printed.trim()) return printed.toLocaleUpperCase("tr-TR");

  return code
    .replace(/^Key(?=[A-Z]$)/, "")
    .replace(/^Digit(?=\d$)/, "")
    .replace(/^Numpad/, "Num ");
};

// "ControlLeft+KeyT" reads "Sol Ctrl + T".
export const formatKeyChord = (value: string, layout: LayoutMap | null): string =>
  value
    .split("+")
    .map((code) => formatKey(code, layout))
    .join(" + ");


const isModifier = (code: string): boolean =>
  /^(Control|Shift|Alt|Meta)/.test(code);

// Side buttons reach push-to-talk only through the Windows mouse hook, so they
// are recorded only there.
const recordsSideButtons = window.desktopApi.platform === "win32";

const sideButton = (event: MouseEvent): string | null => {
  if (!recordsSideButtons) return null;
  if (event.button === 3) return "Mouse4";
  if (event.button === 4) return "Mouse5";
  return null;
};

// Every key or side button that goes down is added; the first of them that
// comes back up ends the recording. Modifiers are stored first so the chord
// reads "Ctrl + T" whichever went down first.
const createChordRecorder = (
  onChord: (chord: string[]) => void,
  onCommit: (value: string) => void,
) => {
  let chord: string[] = [];
  const set = (next: string[]): void => {
    chord = next;
    onChord(next);
  };

  return {
    isEmpty: (): boolean => chord.length === 0,
    press: (code: string): void => {
      if (
        isPushToTalkKey(code) &&
        !chord.includes(code) &&
        chord.length < MAX_PUSH_TO_TALK_KEYS
      ) {
        set([...chord, code]);
      }
    },
    release: (code: string): void => {
      // A key outside the table (a media key) went down unrecorded; its
      // release must not end the chord early.
      if (!chord.includes(code)) return;
      const ordered = [
        ...chord.filter(isModifier),
        ...chord.filter((entry) => !isModifier(entry)),
      ];
      set([]);
      onCommit(ordered.join("+"));
    },
    reset: (): void => set([]),
  };
};

// Records one key, a chord, or a side button. Escape cancels and Backspace or
// Delete clears, but only as the first key: inside a chord they are ordinary
// keys.
export const useChordCapture = ({
  active,
  onCommit,
  onCancel,
  onClear,
}: CaptureHandlers & { active: boolean }): string[] => {
  const [chord, setChord] = useState<string[]>([]);
  const handlersRef = useRef({ onCommit, onCancel, onClear });

  useEffect(() => {
    handlersRef.current = { onCommit, onCancel, onClear };
  });

  useEffect(() => {
    if (!active) {
      return;
    }
    const recorder = createChordRecorder(setChord, (value) =>
      handlersRef.current.onCommit(value),
    );

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (recorder.isEmpty() && event.key === "Escape") {
        handlersRef.current.onCancel();
      } else if (
        recorder.isEmpty() &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        handlersRef.current.onClear();
      } else {
        recorder.press(event.code);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      recorder.release(event.code);
    };
    // Chromium goes Back on a side button's mouseup unless it is prevented.
    const handleMouse = (event: MouseEvent): void => {
      const code = sideButton(event);
      if (!code) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "mousedown") recorder.press(code);
      else recorder.release(code);
    };
    // Alt-Tab away mid-chord: its key-ups go to another window.
    const handleBlur = (): void => {
      recorder.reset();
      handlersRef.current.onCancel();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouse, true);
    window.addEventListener("mouseup", handleMouse, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouse, true);
      window.removeEventListener("mouseup", handleMouse, true);
      window.removeEventListener("blur", handleBlur);
      recorder.reset();
    };
  }, [active]);

  return chord;
};
