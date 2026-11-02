// Push-to-talk keys are stored as KeyboardEvent.code values joined by "+"
// ("Space", "ControlLeft+KeyT"). A code names a physical key, not the letter
// printed on it, so a binding means the same key on a Turkish Q, a Turkish F or
// a US board.
//
// The Windows keyboard hook sees scan codes, which name physical keys the same
// way. This is Chromium's Windows column for each code (set 1, with 0xE000 for
// the extended prefix), so the key the settings field recorded is the key the
// hook matches. Mouse4 and Mouse5 are the side buttons (MouseEvent.button 3
// and 4); the mouse hook reports them above the keyboard range.
export const PUSH_TO_TALK_SCAN_CODES: Readonly<Record<string, number>> = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05,
  Digit5: 0x06, Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a,
  Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15,
  KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a,
  BracketRight: 0x1b, Enter: 0x1c, ControlLeft: 0x1d, KeyA: 0x1e, KeyS: 0x1f,
  KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25,
  KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, ShiftLeft: 0x2a,
  Backslash: 0x2b, KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30,
  KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34, Slash: 0x35,
  ShiftRight: 0x36, NumpadMultiply: 0x37, AltLeft: 0x38, Space: 0x39,
  CapsLock: 0x3a, F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40,
  F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44, Pause: 0x45, ScrollLock: 0x46,
  Numpad7: 0x47, Numpad8: 0x48, Numpad9: 0x49, NumpadSubtract: 0x4a,
  Numpad4: 0x4b, Numpad5: 0x4c, Numpad6: 0x4d, NumpadAdd: 0x4e, Numpad1: 0x4f,
  Numpad2: 0x50, Numpad3: 0x51, Numpad0: 0x52, NumpadDecimal: 0x53,
  IntlBackslash: 0x56, F11: 0x57, F12: 0x58, F13: 0x64, F14: 0x65, F15: 0x66,
  F16: 0x67, F17: 0x68, F18: 0x69, F19: 0x6a, F20: 0x6b, F21: 0x6c, F22: 0x6d,
  F23: 0x6e, F24: 0x76,
  NumpadEnter: 0xe01c, ControlRight: 0xe01d, NumpadDivide: 0xe035,
  PrintScreen: 0xe037, AltRight: 0xe038, NumLock: 0xe045, Home: 0xe047,
  ArrowUp: 0xe048, PageUp: 0xe049, ArrowLeft: 0xe04b, ArrowRight: 0xe04d,
  End: 0xe04f, ArrowDown: 0xe050, PageDown: 0xe051, Insert: 0xe052,
  Delete: 0xe053, MetaLeft: 0xe05b, MetaRight: 0xe05c, ContextMenu: 0xe05d,
  Mouse4: 0x10001, Mouse5: 0x10002,
};

export const MAX_PUSH_TO_TALK_KEYS = 4;

export const isPushToTalkKey = (code: string): boolean =>
  Object.hasOwn(PUSH_TO_TALK_SCAN_CODES, code);

// The stored string comes from a preferences file anybody can edit. Anything
// short of a clean binding is no binding: half a combination would fire on keys
// the user never chose.
export const parsePushToTalkKeys = (value: unknown): string[] => {
  if (typeof value !== "string") {
    return [];
  }
  const codes = value.split("+").map((part) => part.trim());
  const valid =
    codes.length <= MAX_PUSH_TO_TALK_KEYS &&
    new Set(codes).size === codes.length &&
    codes.every(isPushToTalkKey);
  return valid ? codes : [];
};

export interface ChordTracker {
  // Returns the new state when this key changed it, otherwise null.
  update: (code: string, down: boolean) => boolean | null;
  // Forgets every held key; returns whether the chord was active.
  reset: () => boolean;
}

// Active while every key of the chord is held, whatever order they went down
// in. Releasing any one of them ends it. Key repeat and keys outside the chord
// change nothing.
export const createChordTracker = (codes: readonly string[]): ChordTracker => {
  const chord = new Set(codes);
  const held = new Set<string>();
  let active = false;

  return {
    update: (code, down) => {
      if (!chord.has(code)) {
        return null;
      }
      if (down) held.add(code);
      else held.delete(code);

      const next = chord.size > 0 && held.size === chord.size;
      if (next === active) {
        return null;
      }
      active = next;
      return active;
    },
    reset: () => {
      held.clear();
      const was = active;
      active = false;
      return was;
    },
  };
};

// Space was the default key until 0.3.3 and went into every preferences file.
// Somebody who never turned push-to-talk on did not choose it, and the key now
// listens system-wide, so on load it goes back to unbound.
// ponytail: also clears a Space someone picked and then switched push-to-talk
// off; add a migration marker to the file if that ever matters.
export const clearUnusedLegacyKey = (enabled: boolean, key: string): string =>
  !enabled && key === "Space" ? "" : key;
