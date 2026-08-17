import EmojiPicker, {
  Categories,
  EmojiStyle,
  SuggestionMode,
  Theme,
  type CategoryConfig,
} from "emoji-picker-react";
import { useUiStore } from "@/store/ui-store";

// Its own module purely so it can be a lazy chunk.
//
// emoji-picker-react carries the whole emoji table and is ~300 kB of the bundle.
// Imported from chat-message-parts it landed in the eagerly-parsed startup chunk
// (the manualChunks rule matches "react" in the package name, so it shipped
// alongside react-dom) and every launch paid for it — for a popover most sessions
// never open. Nothing here may be imported statically by a chat surface, enums
// included: one static import of `Theme` pulls the library straight back in.

// The library ships English category labels and every other string in this app
// is Turkish, so the list is spelled out rather than defaulted.
const EMOJI_CATEGORIES: CategoryConfig[] = [
  { category: Categories.SUGGESTED, name: "Son kullanılanlar" },
  { category: Categories.SMILEYS_PEOPLE, name: "İfadeler ve insanlar" },
  { category: Categories.ANIMALS_NATURE, name: "Hayvanlar ve doğa" },
  { category: Categories.FOOD_DRINK, name: "Yiyecek ve içecek" },
  { category: Categories.TRAVEL_PLACES, name: "Seyahat ve mekanlar" },
  { category: Categories.ACTIVITIES, name: "Etkinlikler" },
  { category: Categories.OBJECTS, name: "Nesneler" },
  { category: Categories.SYMBOLS, name: "Semboller" },
  { category: Categories.FLAGS, name: "Bayraklar" },
];

interface EmojiKeyboardProps {
  onPick: (emoji: string) => void;
}

/**
 * One keyboard behind both buttons — reactions and the composer pick from the
 * same set, the same search and the same recents list.
 *
 * EmojiStyle.NATIVE draws with the platform emoji font rather than pulling a
 * sprite sheet off a CDN: nothing to download when the popover opens, it works
 * offline, and the grid matches exactly what a sent message renders as.
 * The size is fixed and the grid scrolls inside it, so the popover cannot grow
 * to the ~1900 emoji it now offers.
 */
export default function EmojiKeyboard({
  onPick,
}: EmojiKeyboardProps): JSX.Element {
  // The picker paints its own panel rather than reading our tokens, so it has to
  // be told which theme it is in — it used to be pinned to DARK, which put a
  // black grid inside a white popover for anyone on the light theme.
  const themeMode = useUiStore((state) => state.themeMode);

  return (
    <EmojiPicker
      className="ct-emoji-picker"
      onEmojiClick={(data) => onPick(data.emoji)}
      theme={themeMode === "light" ? Theme.LIGHT : Theme.DARK}
      emojiStyle={EmojiStyle.NATIVE}
      categories={EMOJI_CATEGORIES}
      suggestedEmojisMode={SuggestionMode.RECENT}
      searchPlaceHolder="Emoji ara…"
      searchClearButtonLabel="Temizle"
      previewConfig={{ showPreview: false }}
      lazyLoadEmojis
      width={320}
      height={380}
    />
  );
}
