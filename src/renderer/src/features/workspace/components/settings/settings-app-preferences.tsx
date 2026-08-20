import { useEffect, useState } from "react";
import { Button, message } from "antd";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";

type MessageApi = ReturnType<typeof message.useMessage>[0];

const DEFAULT_APP_PREFERENCES: DesktopAppPreferences = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  hardwareAcceleration: true,
  desktopNotifications: true,
  hotkeyToggleMute: "",
  hotkeyToggleDeafen: "",
  pushToTalk: false,
  pushToTalkKey: "Space",
  freeGameNotifications: true,
};

/**
 * Desktop preferences are a single store behind one partial-patch IPC call, but
 * they are shown in two places now that the mic hotkeys sit on the Ses tab
 * where people look for them. Both panels share this rather than each carrying
 * its own copy of the load / optimistic-write / rollback dance.
 */
export function useDesktopAppPreferences(messageApi: MessageApi) {
  const [preferences, setPreferences] = useState<DesktopAppPreferences>(
    DEFAULT_APP_PREFERENCES,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [needsRelaunch, setNeedsRelaunch] = useState(false);

  useEffect(() => {
    let active = true;

    void window.desktopApi
      .getAppPreferences()
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.ok && result.data?.preferences) {
          setPreferences(result.data.preferences);
          return;
        }

        if (!result.ok) {
          messageApi.error(
            `Uygulama ayarları alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        messageApi.error(
          `Uygulama ayarları alınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      });

    return () => {
      active = false;
    };
    // messageApi comes from antd message.useMessage(), which memoises it — listing
    // it costs nothing and stops the rule hiding a real omission behind this one.
  }, [messageApi]);

  const savePreference = async (
    key: keyof DesktopAppPreferences,
    value: boolean | string,
  ): Promise<void> => {
    const previousPreferences = preferences;

    setIsSaving(true);
    setPreferences((previous) => ({
      ...previous,
      [key]: value,
    }));

    try {
      const result = await window.desktopApi.setAppPreferences({
        [key]: value,
      });

      if (!result.ok || !result.data?.preferences) {
        setPreferences(previousPreferences);
        messageApi.error(
          `Uygulama ayarı kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setPreferences(result.data.preferences);

      // GPU/WebRTC switches are read once at process start, so this one needs a
      // restart before it does anything.
      if (key === "hardwareAcceleration") {
        setNeedsRelaunch(true);
        messageApi.info(
          "Donanım hızlandırma ayarı, uygulama yeniden başlatıldığında geçerli olur.",
        );
        return;
      }

      messageApi.success("Uygulama davranış ayarları kaydedildi.");
    } catch (error) {
      setPreferences(previousPreferences);
      messageApi.error(
        `Uygulama ayarı kaydedilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return { preferences, isSaving, needsRelaunch, savePreference };
}

// Electron accelerators name modifiers differently from KeyboardEvent, and
// nobody should have to type "CommandOrControl+Shift+M" by hand.
const toAccelerator = (event: KeyboardEvent): string | null => {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
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

interface HotkeyCaptureFieldProps {
  label: string;
  hint: string;
  value: string;
  // "accelerator" produces an Electron global-shortcut string; "key" stores a
  // raw KeyboardEvent.code for the renderer-side push-to-talk listener.
  mode: "accelerator" | "key";
  disabled: boolean;
  // Set on a field that only exists while the row above it is on -- the
  // push-to-talk key belongs to the push-to-talk switch and reads as a
  // free-standing setting without it.
  detail?: boolean;
  onChange: (value: string) => void;
}

export function HotkeyCaptureField({
  label,
  hint,
  value,
  mode,
  disabled,
  detail = false,
  onChange,
}: HotkeyCaptureFieldProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        onChange("");
        setCapturing(false);
        return;
      }

      if (mode === "key") {
        if (/^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Space)$/.test(event.code)) {
          onChange(event.code);
          setCapturing(false);
        }
        return;
      }

      const accelerator = toAccelerator(event);
      if (accelerator) {
        onChange(accelerator);
        setCapturing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [capturing, mode, onChange]);

  return (
    <div className={`ct-settings-row${detail ? " detail" : ""}`}>
      <div className="ct-settings-row-text">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <Button
        disabled={disabled}
        onClick={() => setCapturing((previous) => !previous)}
        className="ct-hotkey-button"
        // The button's own label is the whole state of this control, and it
        // changes without the pointer moving -- a screen reader is told about
        // it here or not at all.
        aria-live="polite"
      >
        {capturing ? "Tuşa basın…" : value || "Atanmadı"}
      </Button>
    </div>
  );
}
