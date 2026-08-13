import { useEffect, useRef } from "react";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";

interface UseVoiceHotkeysParams {
  preferences: DesktopAppPreferences | null;
  micEnabled: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  // Push-to-talk drives the mic directly rather than going through the toggle,
  // so a key-repeat can never leave it inverted.
  onSetMic: (enabled: boolean) => void;
}

// Two separate mechanisms, because the platform gives us two:
//
//   - Global toggles come from the main process (globalShortcut), which fires
//     on key-DOWN only. That is enough for a toggle and works while the window
//     is in the background.
//   - Hold-to-talk needs key-UP, which globalShortcut does not provide at all.
//     Doing it globally would mean a native keyboard hook — a new native
//     dependency on all three platforms — so it is a renderer listener and only
//     applies while the window has focus. Losing focus releases the key, which
//     is also the safe failure: the mic closes rather than staying open.
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

  useEffect(() => {
    handlersRef.current = { onToggleMic, onToggleDeafen, onSetMic };
    micEnabledRef.current = micEnabled;
  });

  useEffect(() => {
    const unsubscribe = window.desktopApi.onHotkey((event) => {
      if (event.action === "toggle-mute") {
        handlersRef.current.onToggleMic();
        return;
      }
      handlersRef.current.onToggleDeafen();
    });

    return unsubscribe;
  }, []);

  const pushToTalk = preferences?.pushToTalk ?? false;
  const pushToTalkKey = preferences?.pushToTalkKey ?? "Space";

  useEffect(() => {
    if (!pushToTalk) {
      return;
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

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== pushToTalkKey || event.repeat) {
        return;
      }
      // Space is the obvious binding and also the obvious thing to type.
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (micEnabledRef.current) {
        return;
      }

      talkingRef.current = true;
      handlersRef.current.onSetMic(true);
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== pushToTalkKey || !talkingRef.current) {
        return;
      }

      event.preventDefault();
      talkingRef.current = false;
      handlersRef.current.onSetMic(false);
    };

    // The keyup never arrives if the window loses focus mid-press, which would
    // leave a hot mic open indefinitely.
    const handleBlur = (): void => {
      if (!talkingRef.current) {
        return;
      }
      talkingRef.current = false;
      handlersRef.current.onSetMic(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      handleBlur();
    };
  }, [pushToTalk, pushToTalkKey]);

  // Turning push-to-talk on closes the mic: the whole point is that it is shut
  // until you hold the key.
  useEffect(() => {
    if (pushToTalk && micEnabledRef.current) {
      handlersRef.current.onSetMic(false);
    }
  }, [pushToTalk]);
};
