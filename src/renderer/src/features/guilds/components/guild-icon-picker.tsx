import { useRef, useState } from "react";
import { Button } from "antd";
import { ImageCropModal } from "@/ui/image-crop-modal";
import { toast } from "@/services/toast";
import { GuildIcon } from "./guild-icon";

const ACCEPTED = "image/png,image/jpeg,image/webp";
// Before the crop: the file is read whole, so keep it to a sane size.
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

interface GuildIconPickerProps {
  /** The data URL, "" for none. */
  value: string;
  /** The server's name, for the initials when there is no picture. */
  name: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

/** Picks a square server icon through the app's crop dialog (256 px JPEG). */
export function GuildIconPicker({ value, name, onChange, disabled }: GuildIconPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const pick = (file: File | undefined): void => {
    if (!file) return;
    if (!ACCEPTED.split(",").includes(file.type) || file.size > MAX_SOURCE_BYTES) {
      toast.error("PNG, JPEG ya da WebP bir görsel seç (en çok 8 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSource(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast.error("Görsel okunamadı.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="ct-guild-icon-picker">
      <GuildIcon guild={{ name: name || "?", iconDataUrl: value }} size={56} />
      <div className="ct-guild-icon-picker-actions">
        <Button size="small" onClick={() => inputRef.current?.click()} disabled={disabled}>
          {value ? "Simgeyi değiştir" : "Simge seç"}
        </Button>
        {value && (
          <Button size="small" type="text" onClick={() => onChange("")} disabled={disabled}>
            Kaldır
          </Button>
        )}
        <span className="ct-field-hint">İsteğe bağlı. Kare olarak kırpılır.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <ImageCropModal
        open={source !== null}
        src={source}
        aspect={1}
        outputWidth={256}
        animated={false}
        title="Simgeyi konumlandır"
        onApply={(_rect, cropped) => {
          if (cropped) onChange(cropped);
          setSource(null);
        }}
        onCancel={() => setSource(null)}
      />
    </div>
  );
}
