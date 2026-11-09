import { useEffect, useState, type ReactNode } from "react";
import { Button } from "antd";
import type { DesktopAppPreferences } from "@shared/desktop-api-types";
import { toast } from "@/services/toast";
import { publishDesktopPreferences } from "@/store/desktop-preferences";
import { setHotkeyCapturing } from "@/store/hotkey-capture";
import { SettingsRow } from "./settings-layout";
import {
  formatHotkey,
  formatKeyChord,
  useAcceleratorCapture,
  useChordCapture,
  useKeyboardLayout,
} from "./hotkey-capture";
import { getApiErrorMessage } from "@/features/workspace/workspace-utils";
import { toErrorMessage } from "@shared/error-message";

const DEFAULT_APP_PREFERENCES: DesktopAppPreferences = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  hardwareAcceleration: true,
  desktopNotifications: true,
  hotkeyToggleMute: "",
  hotkeyToggleDeafen: "",
  pushToTalk: false,
  pushToTalkKey: "",
  freeGameNotifications: true,
  shareGameActivity: true,
};

/**
 * Desktop preferences are a single store behind one partial-patch IPC call, but
 * they are shown in two places now that the mic hotkeys sit on the Ses tab
 * where people look for them. Both panels share this rather than each carrying
 * its own copy of the load / optimistic-write / rollback dance.
 */
export function useDesktopAppPreferences() {
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
          toast.error(
            `Uygulama ayarları alınamadı: ${getApiErrorMessage(result.error)}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        toast.error(
          `Uygulama ayarları alınamadı: ${toErrorMessage(error, "Bir sorun oluştu.")}`,
        );
      });

    return () => {
      active = false;
    };
  }, []);

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
        toast.error(
          `Uygulama ayarı kaydedilemedi: ${getApiErrorMessage(result.error)}`,
        );
        return;
      }

      setPreferences(result.data.preferences);
      publishDesktopPreferences(result.data.preferences);

      // GPU/WebRTC switches are read once at process start, so this one needs a
      // restart before it does anything.
      if (key === "hardwareAcceleration") {
        setNeedsRelaunch(true);
        toast.info(
          "Donanım hızlandırma ayarı, uygulama yeniden başlatıldığında geçerli olur.",
        );
        return;
      }

      toast.success("Uygulama davranış ayarları kaydedildi.");
    } catch (error) {
      setPreferences(previousPreferences);
      toast.error(
        `Uygulama ayarı kaydedilemedi: ${toErrorMessage(error, "Bir sorun oluştu.")}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return { preferences, isSaving, needsRelaunch, savePreference };
}

interface HotkeyCaptureFieldProps {
  icon?: ReactNode;
  label: string;
  hint: string;
  value: string;
  // "accelerator" produces an Electron global-shortcut string; "key" stores
  // one key or a chord of KeyboardEvent.code values for push-to-talk.
  mode: "accelerator" | "key";
  disabled: boolean;
  // Set on a field that only exists while the row above it is on -- the
  // push-to-talk key belongs to the push-to-talk switch and reads as a
  // free-standing setting without it.
  detail?: boolean;
  onChange: (value: string) => void;
}

export function HotkeyCaptureField({
  icon,
  label,
  hint,
  value,
  mode,
  disabled,
  detail = false,
  onChange,
}: HotkeyCaptureFieldProps) {
  const [capturing, setCapturing] = useState(false);
  const layout = useKeyboardLayout();
  const handlers = {
    onCommit: (next: string) => {
      onChange(next);
      setCapturing(false);
    },
    onCancel: () => setCapturing(false),
    onClear: () => {
      onChange("");
      setCapturing(false);
    },
  };
  const chord = useChordCapture({
    active: capturing && mode === "key",
    ...handlers,
  });
  useAcceleratorCapture({
    active: capturing && mode === "accelerator",
    ...handlers,
  });

  // The keys pressed here are often the current bindings; they must not talk
  // or toggle the mic while being recorded (use-voice-hotkeys.ts).
  useEffect(() => {
    if (!capturing) {
      return;
    }
    setHotkeyCapturing(true);
    return () => setHotkeyCapturing(false);
  }, [capturing]);

  let text = "Atanmadı";
  if (capturing) {
    text =
      chord.length > 0
        ? `${formatKeyChord(chord.join("+"), layout)} …`
        : "Tuşa bas…";
  } else if (value) {
    text = mode === "key" ? formatKeyChord(value, layout) : formatHotkey(value);
  }

  return (
    <SettingsRow icon={icon} title={label} description={hint} detail={detail}>
      <Button
        disabled={disabled}
        onClick={() => setCapturing((previous) => !previous)}
        className={`ct-hotkey-button${capturing ? " capturing" : ""}${value ? "" : " empty"}`}
        // The button's own label is the whole state of this control, and it
        // changes without the pointer moving -- a screen reader is told about
        // it here or not at all.
        aria-live="polite"
      >
        {text}
      </Button>
    </SettingsRow>
  );
}
