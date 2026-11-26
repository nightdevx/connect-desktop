import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { useQuery } from "@tanstack/react-query";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon } from "@/ui/odak-menu";
import { toast } from "@/services/toast";
import { isInviteCode, normalizeInviteCode } from "../guild-logic";
import { callGuild, errorText } from "../guild-service";
import { showGuild, useGuildUi } from "../guild-store";
import { useRefreshGuilds } from "../use-guilds";
import { GuildIcon } from "./guild-icon";

/** The preview of an invite code, shared by this dialog and the chat card. */
export const useInvitePreview = (code: string | null) =>
  useQuery({
    queryKey: ["guild-invite", code],
    queryFn: () => callGuild("previewInvite", { code: code ?? "" }),
    enabled: code !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });

/** Joins by invite code and shows the server. Shared with the chat card. */
export const useJoinByInvite = () => {
  const refresh = useRefreshGuilds();
  const [busy, setBusy] = useState(false);
  const join = async (code: string): Promise<boolean> => {
    setBusy(true);
    try {
      const { guild } = await callGuild("joinInvite", { code });
      await refresh();
      showGuild(guild.id);
      toast.success(`${guild.name} sunucusuna katıldın`);
      return true;
    } catch (failure) {
      toast.error(errorText(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { join, busy };
};

/** Katıl: paste an 8-character code, see the server, join it. */
export function GuildJoinDialog() {
  const dialog = useGuildUi((state) => state.dialog);
  const closeDialog = useGuildUi((state) => state.closeDialog);
  const open = dialog?.kind === "join";
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? (dialog?.kind === "join" ? (dialog.code ?? "") : "");
  const code = isInviteCode(value) ? normalizeInviteCode(value) : null;
  const preview = useInvitePreview(code);
  const { join, busy } = useJoinByInvite();
  const invite = preview.data?.invite;

  const close = (): void => {
    closeDialog();
    setTyped(null);
  };

  const submit = async (): Promise<void> => {
    if (!code || !invite) return;
    if (invite.isMember) {
      showGuild(invite.guildId);
      close();
      return;
    }
    if (await join(code)) close();
  };

  return (
    <Modal
      rootClassName="ct-modal"
      open={open}
      onCancel={close}
      width={MODAL_WIDTH.s}
      destroyOnHidden
      title={
        <ModalHeading
          icon={<MenuIcon name="login" size={19} />}
          title="Kodla katıl"
          description="Sana gönderilen 8 karakterlik davet kodunu yapıştır."
        />
      }
      footer={[
        <Button key="cancel" onClick={close} disabled={busy}>
          Vazgeç
        </Button>,
        <Button key="join" type="primary" disabled={!invite} loading={busy} onClick={() => void submit()}>
          {invite?.isMember ? "Sunucuya git" : "Katıl"}
        </Button>,
      ]}
    >
      <form
        className="ct-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="ct-field">
          <span>Davet kodu</span>
          <Input
            className="ct-guild-code-input"
            value={value}
            onChange={(event) => setTyped(event.target.value.toUpperCase())}
            maxLength={12}
            placeholder="ABCD2345"
            autoFocus
            spellCheck={false}
            aria-describedby="guild-join-status"
          />
        </label>
        <div id="guild-join-status" aria-live="polite">
          {code && preview.isLoading && <span className="ct-field-hint">Kod kontrol ediliyor…</span>}
          {code && preview.isError && (
            <small className="ct-field-error" role="alert">
              <MenuIcon name="alert" size={14} />
              {errorText(preview.error)}
            </small>
          )}
          {invite && (
            <div className="ct-guild-preview">
              <GuildIcon guild={invite} size={44} />
              <span className="ct-guild-preview-text">
                <strong>{invite.name}</strong>
                <span>
                  {invite.memberCount} üye{invite.isMember ? " · zaten üyesin" : ""}
                </span>
              </span>
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
