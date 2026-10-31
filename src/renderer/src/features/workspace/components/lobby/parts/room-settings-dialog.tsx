import { useMemo, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";
import { Button, Input, InputNumber, Modal, Select, Switch } from "antd";
import { LOBBY_FEATURES, type LobbyFeatureId } from "@shared/desktop-api-types";
import type { FriendEntry, LobbyDescriptor } from "@shared/auth-contracts";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon } from "@/ui/odak-menu";
import { SEED_ADMIN_ID } from "@/features/auth";
import { useUserCards } from "../../../hooks/user/use-user-cards";
import workspaceService from "../../../services";
import { getApiErrorMessage, getDisplayInitials } from "../../../workspace-utils";
import "@/styles/modules/features/odak-pencereler.css";

type UpdateLobby = (
  lobbyId: string,
  name: string,
  isLocked?: boolean,
  allowedUsers?: string[],
  password?: string | null,
  capacity?: number,
  disabledFeatures?: LobbyFeatureId[],
) => Promise<boolean>;

interface RoomSettingsDialogProps {
  /** The room being edited, as it was when the dialog opened; null = shut. */
  lobby: LobbyDescriptor | null;
  onClose: () => void;
  onUpdateLobby: UpdateLobby;
  isSaving: boolean;
  /** Absent for the main room, which cannot be deleted. */
  onDelete?: () => void;
  currentUserId: string;
  allUsers: Array<{ id: string; username: string; displayName: string }>;
}

const splitIds = (value?: string): string[] =>
  value
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [];

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

// The server's rule (internal/lobby/handler.go): 6 characters, at most 72
// bytes, which a Turkish letter spends two of.
const passwordProblem = (password: string): string | null => {
  const value = password.trim();
  if (value === "") return null;
  if (value.length < 6) return "Şifre en az 6 karakter olmalı.";
  if (new TextEncoder().encode(value).length > 72) {
    return "Şifre çok uzun: en çok 72 bayt (Türkçe harfler iki bayt sayılır).";
  }
  return null;
};

function Section({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className={`ct-room-section${danger ? " danger" : ""}`} aria-label={title}>
      <h3 className="ct-room-section-title">{title}</h3>
      {children}
    </section>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }): JSX.Element {
  return (
    <small id={id} className="ct-field-error" role="alert">
      <MenuIcon name="alert" size={14} />
      {children}
    </small>
  );
}

/**
 * Oda ayarları, for whoever manages the room: grouped as Genel, Erişim,
 * Kapasite, Özellikler and, last, Tehlikeli bölge. Kaydet wakes only when
 * something changed and every field is valid; a field's problem is said under
 * it. Saving turns the dialog into what was saved, in place. Enter in a text
 * field saves, Esc leaves.
 *
 * Every rule of the old dialog is kept: the type is fixed at creation, a text
 * room has no password or ceiling, an empty ceiling means the server default,
 * an empty password keeps the old one, and the allow-list takes friends or an
 * exact username.
 */
export function RoomSettingsDialog({
  lobby,
  onClose,
  onUpdateLobby,
  isSaving,
  onDelete,
  currentUserId,
  allUsers,
}: RoomSettingsDialogProps): JSX.Element {
  const [name, setName] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  // null means "follow the server default", which is what a room that never
  // chose a limit does.
  const [capacity, setCapacity] = useState<number | null>(null);
  const [disabledFeatures, setDisabledFeatures] = useState<LobbyFeatureId[]>([]);
  // allUsers is friends + self, so the select alone can never reach a
  // stranger. These are the ones pulled in by exact username this session —
  // kept only so their tag renders a name instead of a bare id.
  const [lookedUpUsers, setLookedUpUsers] = useState<FriendEntry[]>([]);
  const [lookupUsername, setLookupUsername] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  // What was saved, shown in place of the form until the dialog is closed.
  const [saved, setSaved] = useState<string[] | null>(null);

  // Reset to the room's values each time the dialog opens on a room: during
  // render, not in an effect, so the first frame already shows them.
  const [openedFor, setOpenedFor] = useState<LobbyDescriptor | null>(null);
  if (!lobby && openedFor) {
    // Shut: the next opening resets, even on the very same room object.
    setOpenedFor(null);
  }
  if (lobby && lobby !== openedFor) {
    setOpenedFor(lobby);
    setName(lobby.name);
    setIsLocked(Boolean(lobby.isLocked));
    setAllowedUsers(splitIds(lobby.allowedUsers));
    setPassword("");
    setRemovePassword(false);
    // The room reports its live ceiling, so the field opens on what is
    // actually enforced rather than on an empty box.
    setCapacity(lobby.capacity ?? null);
    setDisabledFeatures((lobby.disabledFeatures ?? []) as LobbyFeatureId[]);
    setLookedUpUsers([]);
    setLookupUsername("");
    setLookupError(null);
    setSaved(null);
  }

  // The allow-list as it is STORED, resolved to names: a stranger let in by
  // username earlier is not among allUsers and would show as a bare id. Empty
  // while the dialog is shut, so the card queries cost nothing until it opens.
  const storedAllowedIds = useMemo(() => splitIds(lobby?.allowedUsers), [lobby]);
  const storedCards = useUserCards(storedAllowedIds);

  const isTextOnly = Boolean(lobby?.isTextOnly);
  const trimmedName = name.trim();
  const nameError = trimmedName.length < 2 ? "Oda adı en az 2 karakter olmalı." : null;
  const passwordError = removePassword ? null : passwordProblem(password);

  // What would change, in words: the dirty check, the footer's count and the
  // success summary are all this one list.
  const changes = useMemo((): string[] => {
    if (!lobby) return [];
    const list: string[] = [];
    if (trimmedName !== lobby.name) list.push(`Ad: ${trimmedName}`);
    if (isLocked !== Boolean(lobby.isLocked)) list.push(isLocked ? "Oda kilitlendi" : "Kilit açıldı");
    if (!sameSet(allowedUsers, splitIds(lobby.allowedUsers))) {
      list.push(`Erişimi olanlar: ${allowedUsers.length} kişi`);
    }
    if (!isTextOnly) {
      if (removePassword) list.push("Şifre kaldırıldı");
      else if (password.trim() !== "") list.push(lobby.hasPassword ? "Şifre değişti" : "Şifre kondu");
      if (capacity !== (lobby.capacity ?? null)) {
        list.push(capacity === null ? "Kişi sınırı: sunucu varsayılanı" : `Kişi sınırı: ${capacity}`);
      }
    }
    const before = (lobby.disabledFeatures ?? []) as string[];
    for (const feature of LOBBY_FEATURES) {
      const wasOff = before.includes(feature.id);
      const isOff = disabledFeatures.includes(feature.id);
      if (wasOff !== isOff) list.push(`${feature.label}: ${isOff ? "kapalı" : "açık"}`);
    }
    return list;
  }, [allowedUsers, capacity, disabledFeatures, isLocked, isTextOnly, lobby, password, removePassword, trimmedName]);

  const isDirty = changes.length > 0;
  const isValid = !nameError && !passwordError;
  const canSave = isDirty && isValid && !isSaving;

  const handleLookupAdd = async (): Promise<void> => {
    // A pasted "@ali" is the same person as "ali"; the route matches exactly.
    const username = lookupUsername.trim().replace(/^@/, "");
    if (!username) {
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);
    try {
      const result = await workspaceService.lookupUserByUsername({ username });
      if (!result.ok || !result.data) {
        setLookupError(
          result.error?.code === "USER_NOT_FOUND" || result.error?.code === "VALIDATION_ERROR"
            ? `“${username}” adında biri yok. Kullanıcı adını tam yaz.`
            : getApiErrorMessage(result.error),
        );
        return;
      }

      const user = result.data.user;
      if (user.userId === currentUserId) {
        setLookupError("Oda sahibi her zaman girebilir; kendini eklemen gerekmez.");
        setLookupUsername("");
        return;
      }

      setLookedUpUsers((previous) =>
        previous.some((entry) => entry.userId === user.userId) ? previous : [...previous, user],
      );
      setAllowedUsers((previous) =>
        previous.includes(user.userId) ? previous : [...previous, user.userId],
      );
      setLookupUsername("");
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!lobby || !canSave) {
      return;
    }

    // password: remove -> "" (clear), a new value -> set, empty -> undefined (keep).
    const passwordArg = removePassword ? "" : password.trim() ? password.trim() : undefined;
    const summary = changes;

    const updated = await onUpdateLobby(
      lobby.id,
      name,
      isLocked,
      allowedUsers,
      passwordArg,
      // 0 rather than undefined when the field is cleared: undefined would keep
      // whatever the room has, and clearing it means "go back to the default".
      isTextOnly ? undefined : (capacity ?? 0),
      disabledFeatures,
    );
    if (updated) {
      setSaved(summary);
    }
  };

  // Enter in a text field saves; the username box and the people picker keep
  // Enter for themselves.
  const handleFormKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName !== "INPUT" || target.closest(".ant-select, .ct-room-lookup")) {
      return;
    }
    event.preventDefault();
    void handleSubmit();
  };

  const peopleOptions = [
    ...allUsers
      .filter((user) => user.id !== currentUserId && user.id !== SEED_ADMIN_ID)
      .map((user) => ({ label: `@${user.username} (${user.displayName})`, value: user.id })),
    ...lookedUpUsers.map((user) => ({
      label: `@${user.username} (${user.displayName})`,
      value: user.userId,
    })),
  ];
  // Stored ids no option above names: their card, or the raw id until it lands.
  for (const id of storedAllowedIds) {
    if (!peopleOptions.some((option) => option.value === id)) {
      const card = storedCards[id];
      peopleOptions.push({ label: card ? `@${card.username}` : id, value: id });
    }
  }

  const footerStatus = !isValid
    ? "Kırmızı alanı düzelt"
    : isDirty
      ? `${changes.length} değişiklik kaydedilmedi`
      : "Değişiklik yok";

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <ModalHeading
          icon={<MenuIcon name="sliders" size={19} />}
          title="Oda ayarları"
          description={saved ? undefined : "Adı, kimlerin girebileceği ve odada nelerin açık olduğu."}
        />
      }
      open={lobby !== null}
      onCancel={onClose}
      width={MODAL_WIDTH.m}
      destroyOnHidden
      footer={
        saved
          ? [
              <Button key="done" type="primary" onClick={onClose} autoFocus>
                Tamam
              </Button>,
            ]
          : [
              <span key="status" className={`ct-room-footer-status${isDirty ? " dirty" : ""}`}>
                {footerStatus}
              </span>,
              <Button key="cancel" onClick={onClose}>
                Vazgeç
              </Button>,
              <Button
                key="save"
                type="primary"
                disabled={!canSave}
                loading={isSaving}
                onClick={() => void handleSubmit()}
              >
                {isSaving ? "Kaydediliyor…" : "Kaydet"}
              </Button>,
            ]
      }
    >
      {lobby && saved ? (
        <div className="ct-modal-success" role="status">
          <span className="ct-modal-success-mark" aria-hidden="true">
            <MenuIcon name="check" size={20} stroke={2.2} />
          </span>
          <strong>Ayarlar kaydedildi</strong>
          <span>{trimmedName} için değişenler:</span>
          <ul className="ct-room-saved-list">
            {saved.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : lobby ? (
        <div className="ct-modal-form ct-room-settings" onKeyDown={handleFormKeyDown}>
          {/* Whose room, since when, how full: an admin opens this for rooms
              they had no part in creating. */}
          <div className="ct-room-subject">
            <span className="ct-room-subject-tile" aria-hidden="true">
              {isTextOnly ? "#" : getDisplayInitials(lobby.name)}
            </span>
            <span className="ct-room-subject-text">
              <strong>{lobby.name}</strong>
              <span>
                {lobby.createdByUsername ? `@${lobby.createdByUsername}` : lobby.createdBy} ·{" "}
                {new Date(lobby.createdAt).toLocaleString("tr-TR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </span>
            <code className="ct-room-subject-id">{lobby.id}</code>
          </div>

          <Section title="Genel">
            <label className="ct-field" htmlFor="edit-lobby-name">
              <span className="ct-field-label-row">
                Oda adı
                <span className="ct-field-count">{name.length}/64</span>
              </span>
              <input
                id="edit-lobby-name"
                type="text"
                className={`ct-input${nameError ? " invalid" : ""}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={64}
                disabled={isSaving}
                autoFocus
                aria-invalid={nameError ? true : undefined}
                aria-describedby="edit-lobby-name-hint"
              />
              {nameError ? (
                <FieldError id="edit-lobby-name-hint">{nameError}</FieldError>
              ) : (
                <small id="edit-lobby-name-hint" className="ct-field-hint">
                  Listede ve odanın başlığında herkes bu adı görür.
                </small>
              )}
            </label>

            <div className="ct-room-row">
              <span className="ct-room-row-icon" aria-hidden="true">
                <MenuIcon name={isTextOnly ? "message" : "volume"} />
              </span>
              <span className="ct-room-row-text">
                <strong>{isTextOnly ? "Mesaj odası" : "Sesli oda"}</strong>
                <span>Tür oda açılırken seçilir, sonradan değişmez.</span>
              </span>
            </div>
          </Section>

          <Section title="Erişim">
            <div className="ct-room-row">
              <span className="ct-room-row-icon" aria-hidden="true">
                <MenuIcon name="lock" />
              </span>
              <span className="ct-room-row-text">
                <strong id="ct-room-lock-label">Kilitli oda</strong>
                <span>
                  {isTextOnly
                    ? "Açıkken odayı yalnız izin verdiğin kişiler görür."
                    : "Açıkken odaya yalnız izin verdiğin kişiler katılır."}
                </span>
              </span>
              <Switch
                size="small"
                checked={isLocked}
                onChange={setIsLocked}
                aria-labelledby="ct-room-lock-label"
              />
            </div>

            {/* A <div>, not a <label>: there are two controls in here, and a
                label that points at two things points at neither. */}
            {isLocked && (
              <div className="ct-field ct-room-people">
                <span>İzin verilen kişiler</span>
                <Select
                  mode="multiple"
                  placeholder="Arkadaşlarından seç"
                  value={allowedUsers}
                  onChange={setAllowedUsers}
                  options={peopleOptions}
                  aria-label="İzin verilen kişiler"
                />
                <Input.Search
                  className="ct-room-lookup"
                  placeholder="Listede yoksa tam kullanıcı adını yaz"
                  enterButton="Ekle"
                  value={lookupUsername}
                  onChange={(event) => {
                    setLookupUsername(event.target.value);
                    setLookupError(null);
                  }}
                  onSearch={() => void handleLookupAdd()}
                  loading={isLookingUp}
                  maxLength={32}
                  status={lookupError ? "error" : undefined}
                  aria-label="Kullanıcı adıyla ekle"
                />
                {lookupError ? (
                  <FieldError id="ct-room-lookup-hint">{lookupError}</FieldError>
                ) : (
                  <small className="ct-field-hint">
                    Listeye girmeyen biri katılamaz; oda sahibi ve yöneticiler her zaman girer.
                  </small>
                )}
              </div>
            )}

            {/* Voice rooms only: the password is asked when joining, and nobody
                joins a text room. The lock applies to both. */}
            {!isTextOnly && (
              <label className="ct-field" htmlFor="edit-lobby-password">
                <span>Oda şifresi</span>
                <Input.Password
                  id="edit-lobby-password"
                  placeholder={
                    lobby.hasPassword ? "Değiştirmek için yeni şifreyi yaz" : "Şifre koymak için yaz"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={removePassword}
                  maxLength={128}
                  status={passwordError ? "error" : undefined}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby="edit-lobby-password-hint"
                />
                {passwordError ? (
                  <FieldError id="edit-lobby-password-hint">{passwordError}</FieldError>
                ) : (
                  <small id="edit-lobby-password-hint" className="ct-field-hint">
                    {lobby.hasPassword
                      ? "Odanın şifresi var. Boş bırakırsan aynı kalır."
                      : "Boş bırakırsan oda şifresiz kalır. Şifreyi bilen herkes, listede olmasa da girer."}
                  </small>
                )}
              </label>
            )}

            {!isTextOnly && lobby.hasPassword && (
              <div className="ct-room-row">
                <span className="ct-room-row-icon" aria-hidden="true">
                  <MenuIcon name="x" />
                </span>
                <span className="ct-room-row-text">
                  <strong id="ct-room-unpass-label">Şifreyi kaldır</strong>
                  <span>Kaydedince oda şifre sormaz.</span>
                </span>
                <Switch
                  size="small"
                  checked={removePassword}
                  onChange={setRemovePassword}
                  aria-labelledby="ct-room-unpass-label"
                />
              </div>
            )}
          </Section>

          {/* Voice rooms only: a text room has no roster, so a ceiling there
              would be a number that never applies to anything. */}
          {!isTextOnly && (
            <Section title="Kapasite">
              <label className="ct-field" htmlFor="edit-lobby-capacity">
                <span>Kişi sınırı</span>
                <InputNumber
                  id="edit-lobby-capacity"
                  className="ct-input-number"
                  min={2}
                  max={100}
                  value={capacity}
                  onChange={(value) => setCapacity(value ?? null)}
                  placeholder="Sunucu varsayılanı"
                  aria-describedby="edit-lobby-capacity-hint"
                />
                <small id="edit-lobby-capacity-hint" className="ct-field-hint">
                  2 ile 100 arası. Şu an odada {lobby.memberCount} kişi var. Boş bırakırsan
                  sunucunun sınırı geçerli olur; sınırı düşürmek kimseyi çıkarmaz, yalnız yeni
                  girişleri durdurur.
                </small>
              </label>
            </Section>
          )}

          <Section title="Özellikler">
            <small className="ct-field-hint">
              Kapattığın özellik bu odada kimse tarafından kullanılamaz. Diğer odalar etkilenmez.
            </small>
            <div className="ct-lobby-feature-grid">
              {LOBBY_FEATURES.filter(
                (feature) => !isTextOnly || feature.id === "chat" || feature.id === "attachments",
              ).map((feature) => {
                const enabled = !disabledFeatures.includes(feature.id);
                return (
                  <label key={feature.id} className="ct-lobby-feature-row">
                    <span>{feature.label}</span>
                    <Switch
                      size="small"
                      checked={enabled}
                      onChange={(next) =>
                        setDisabledFeatures((previous) =>
                          next
                            ? previous.filter((id) => id !== feature.id)
                            : [...previous, feature.id],
                        )
                      }
                    />
                  </label>
                );
              })}
            </div>
          </Section>

          <Section title="Tehlikeli bölge" danger>
            <div className="ct-room-row">
              <span className="ct-room-row-text">
                <strong>Odayı sil</strong>
                <span>
                  {onDelete
                    ? "Oda herkes için kalkar, içindekilerin bağlantısı kesilir. Geri alınamaz."
                    : "Ana oda herkesin girdiği yer olduğu için silinemez."}
                </span>
              </span>
              {onDelete && (
                <Button danger className="ct-room-delete" onClick={onDelete}>
                  Odayı sil…
                </Button>
              )}
            </div>
          </Section>
        </div>
      ) : null}
    </Modal>
  );
}
