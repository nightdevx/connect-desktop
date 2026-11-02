import { useEffect, useRef } from "react";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";
import { parsePushToTalkKeys } from "@shared/push-to-talk-keys";
import { isHotkeyCapturing } from "@/store/hotkey-capture";

interface UseVoiceHotkeysParams {
  preferences: DesktopAppPreferences | null;
  micEnabled: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  // Push-to-talk drives the mic directly rather than going through the toggle,
  // so a key-repeat can never leave it inverted.
  onSetMic: (enabled: boolean) => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  );
};

// A binding of keys used while writing (Space, V, Shift+V, Enter, the arrows)
// must not open the mic while a text field in this window has focus. A chord
// with Ctrl, Alt or Win, or only keys nobody writes with (F5, Pause, a mouse
// side button), is safe anywhere.
const usedWhileTyping = (codes: readonly string[]): boolean =>
  !codes.some((code) => /^(Control|Alt|Meta)/.test(code)) &&
  !codes.every((code) =>
    /^(F\d{1,2}|Pause|ScrollLock|PrintScreen|Insert|ContextMenu|Mouse\d)$/.test(
      code,
    ),
  );

// Every key event arrives from the main process: the mute/deafen toggles from
// globalShortcut, push-to-talk press and release from a keyboard hook that
// works while the app is in the background (main/push-to-talk.ts). The main
// process also releases when a binding changes or, without the hook, when the
// window loses focus, so a hot mic is never left open.
export const useVoiceHotkeys = ({
  preferences,
  micEnabled,
  onToggleMic,
  onToggleDeafen,
  onSetMic,
}: UseVoiceHotkeysParams): void => {
  const handlersRef = useRef({ onToggleMic, onToggleDeafen, onSetMic });
  const micEnabledRef = useRef(micEnabled);
  // Remembers whether push-to-talk opened the mic, so releasing the key never
  // closes a mic the user had deliberately left open.
  const talkingRef = useRef(false);
  const pushToTalk = preferences?.pushToTalk ?? false;
  const pushToTalkKey = preferences?.pushToTalkKey ?? "";
  const pushToTalkCodes = parsePushToTalkKeys(pushToTalkKey);
  const usedWhileTypingRef = useRef(usedWhileTyping(pushToTalkCodes));

  useEffect(() => {
    handlersRef.current = { onToggleMic, onToggleDeafen, onSetMic };
    micEnabledRef.current = micEnabled;
    usedWhileTypingRef.current = usedWhileTyping(pushToTalkCodes);
  });

  useEffect(() => {
    const release = (): void => {
      if (!talkingRef.current) {
        return;
      }
      talkingRef.current = false;
      handlersRef.current.onSetMic(false);
    };

    const unsubscribe = window.desktopApi.onHotkey((event) => {
      // Recording a new shortcut presses the current ones. Only a release gets
      // through, so a mic that was already open still closes.
      const isRelease = event.action === "push-to-talk" && !event.pressed;
      if (isHotkeyCapturing() && !isRelease) {
        return;
      }
      if (event.action !== "push-to-talk") {
        if (event.action === "toggle-mute") {
          handlersRef.current.onToggleMic();
        } else {
          handlersRef.current.onToggleDeafen();
        }
        return;
      }
      if (!event.pressed) {
        release();
        return;
      }
      if (
        usedWhileTypingRef.current &&
        document.hasFocus() &&
        isTypingTarget(document.activeElement)
      ) {
        return;
      }
      if (micEnabledRef.current) {
        return;
      }
      talkingRef.current = true;
      handlersRef.current.onSetMic(true);
    });

    return () => {
      unsubscribe();
      release();
    };
  }, []);

  // Holding Space over a focused button would also press the button. Only a
  // single-key binding needs this: a chord's keys are ordinary keys on their
  // own, and a text field always gets its keys.
  useEffect(() => {
    const codes = parsePushToTalkKeys(pushToTalkKey);
    if (!pushToTalk || codes.length !== 1) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code === codes[0] && !isTypingTarget(event.target)) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pushToTalk, pushToTalkKey]);

  // Push-to-talk with a key closes the mic: the whole point is that it is shut
  // until you hold the key. Without a key (the default) nothing could open it
  // again, so it is left alone until one is set.
  const hasBinding = pushToTalkCodes.length > 0;
  useEffect(() => {
    if (pushToTalk && hasBinding && micEnabledRef.current) {
      handlersRef.current.onSetMic(false);
    }
  }, [pushToTalk, hasBinding]);
};
