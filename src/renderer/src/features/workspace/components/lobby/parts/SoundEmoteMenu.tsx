import { useCallback, useState } from "react";
import { Button, Popover, Tooltip } from "antd";
import { NotificationOutlined } from "@ant-design/icons";
import {
  LOBBY_SOUND_EMOTES,
  type LobbySoundEmote,
} from "@shared/desktop-api-types";

// Label and glyph per emote. The ids come from the shared set so this cannot
// offer one the server would refuse; the picker breaks at compile time if the
// set grows and a label is forgotten.
const EMOTE_LABELS: Record<LobbySoundEmote, { icon: string; label: string }> = {
  clap: { icon: "👏", label: "Alkış" },
  laugh: { icon: "😂", label: "Kahkaha" },
  drum: { icon: "🥁", label: "Trampet" },
  airhorn: { icon: "📣", label: "Korna" },
  wow: { icon: "😮", label: "Vay" },
  sad: { icon: "😢", label: "Üzgün" },
};

interface SoundEmoteMenuProps {
  onSend: (emote: LobbySoundEmote) => void;
  disabled?: boolean;
}

/**
 * The soundboard button.
 *
 * Sending does NOT play anything locally: the sound arrives back over the lobby
 * stream like it does for everyone else, so what the sender hears is what the
 * room heard. A local preview would fire even when the server refused the
 * broadcast (rate limit, no longer a member), which is the one case where the
 * sender most needs to notice.
 */
export function SoundEmoteMenu({ onSend, disabled }: SoundEmoteMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePick = useCallback(
    (emote: LobbySoundEmote): void => {
      setIsOpen(false);
      onSend(emote);
    },
    [onSend],
  );

  return (
    <Popover
      open={disabled ? false : isOpen}
      onOpenChange={setIsOpen}
      trigger="click"
      placement="top"
      rootClassName="ct-sound-emote-popover"
      content={
        <div className="ct-sound-emote-grid">
          {LOBBY_SOUND_EMOTES.map((emote) => (
            <button
              key={emote}
              type="button"
              className="ct-sound-emote-item"
              onClick={() => handlePick(emote)}
              aria-label={EMOTE_LABELS[emote].label}
            >
              <span aria-hidden>{EMOTE_LABELS[emote].icon}</span>
              <span>{EMOTE_LABELS[emote].label}</span>
            </button>
          ))}
        </div>
      }
    >
      <Tooltip title="Sesli Emote">
        <Button
          size="large"
          className={`ct-lobby-action-btn ${isOpen ? "active" : ""}`}
          icon={<NotificationOutlined />}
          disabled={disabled}
          aria-label="Sesli emote gönder"
        />
      </Tooltip>
    </Popover>
  );
}
