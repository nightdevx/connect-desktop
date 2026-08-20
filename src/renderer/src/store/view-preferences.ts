/**
 * Layout choices a person makes by clicking something, and expects to still be
 * there afterwards.
 *
 * These lived as useState inside the panels that draw them, and every one of
 * those panels is unmounted when the workspace switches section — so closing the
 * lobby chat and stepping into Ayarlar for a moment brought it back open. Some of
 * them were then also reset to their default on every lobby change, which meant
 * the choice did not survive even without leaving the screen.
 *
 * ponytail: localStorage, not the backend. This is how the app already stores the
 * theme, the camera/audio/stream settings and the per-participant volumes — it is
 * a property of this screen, and somebody on a laptop and a desktop rarely wants
 * the same answer on both.
 */
export interface ViewPreferences {
  /** The chat column beside a lobby's stage. */
  lobbyChatOpen: boolean;
  /** The message thread beside a 1:1 call's stage. */
  callChatOpen: boolean;
  /** The strip of everyone who is not the focused participant. */
  participantRailVisible: boolean;
  /** The "Sesli Odalar" category in the lobbies sidebar. */
  lobbyVoiceCategoryOpen: boolean;
  /** The "Mesaj Odaları" category in the lobbies sidebar. */
  lobbyTextCategoryOpen: boolean;
}

const VIEW_PREFERENCES_STORAGE_KEY = "ct.settings.view";

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  lobbyChatOpen: true,
  callChatOpen: true,
  participantRailVisible: true,
  lobbyVoiceCategoryOpen: true,
  lobbyTextCategoryOpen: true,
};

export const readViewPreferences = (): ViewPreferences => {
  try {
    const raw = localStorage.getItem(VIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VIEW_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    // Key by key against the defaults, so a stored blob written by an older
    // version — or edited by hand — cannot introduce an undefined where a boolean
    // is expected, and a key added later starts at its default rather than at
    // undefined.
    const restored = { ...DEFAULT_VIEW_PREFERENCES };
    for (const key of Object.keys(DEFAULT_VIEW_PREFERENCES) as Array<
      keyof ViewPreferences
    >) {
      if (typeof parsed[key] === "boolean") {
        restored[key] = parsed[key] as boolean;
      }
    }
    return restored;
  } catch {
    return DEFAULT_VIEW_PREFERENCES;
  }
};

export const saveViewPreferences = (preferences: ViewPreferences): void => {
  try {
    localStorage.setItem(
      VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // A locked-down storage costs the user this layout on next launch, not this
    // session's.
  }
};
