import { useState } from "react";
import { Button, Input, Modal } from "antd";
import type { GuildJoinMode } from "@shared/guild-contracts";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon } from "@/ui/odak-menu";
import { toast } from "@/services/toast";
import { callGuild, errorText } from "../guild-service";
import { showGuild, useGuildUi } from "../guild-store";
import { useGuildList, useRefreshGuilds } from "../use-guilds";
import { GuildIconPicker } from "./guild-icon-picker";
import { JoinModeField } from "./join-mode-field";

/** Sunucu kur: a name, an optional icon and description, who may join. */
export function GuildCreateDialog() {
  const open = useGuildUi((state) => state.dialog?.kind === "create");
  const closeDialog = useGuildUi((state) => state.closeDialog);
  const limit = useGuildList().data?.limits.guildsPerUser ?? 0;
  const refresh = useRefreshGuilds();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [joinMode, setJoinMode] = useState<GuildJoinMode>("invite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    closeDialog();
    setName("");
    setDescription("");
    setIcon("");
    setJoinMode("invite");
    setError(null);
  };

  const canSubmit = name.trim().length > 0 && !busy;
  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { guild } = await callGuild("create", {
        name: name.trim(),
        description: description.trim(),
        iconDataUrl: icon,
        joinMode,
      });
      await refresh();
      showGuild(guild.id);
      toast.success(`${guild.name} kuruldu`);
      close();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      rootClassName="ct-modal"
      open={open}
      onCancel={close}
      width={MODAL_WIDTH.m}
      destroyOnHidden
      title={
        <ModalHeading
          icon={<MenuIcon name="plus" size={19} />}
          title="Sunucu kur"
          description={limit > 0 ? `En çok ${limit} sunucu kurabilirsin. Hepsini sonradan değiştirebilirsin.` : undefined}
        />
      }
      footer={[
        <Button key="cancel" onClick={close} disabled={busy}>
          Vazgeç
        </Button>,
        <Button key="create" type="primary" disabled={!canSubmit} loading={busy} onClick={() => void submit()}>
          Kur
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
        <GuildIconPicker value={icon} name={name} onChange={setIcon} disabled={busy} />
        <label className="ct-field">
          <span className="ct-field-label-row">
            Sunucu adı
            <span className="ct-field-count">{name.length}/48</span>
          </span>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={48} autoFocus />
        </label>
        <label className="ct-field">
          <span className="ct-field-label-row">
            Açıklama
            <span className="ct-field-count">{description.length}/300</span>
          </span>
          <Input.TextArea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="İsteğe bağlı. Keşfet'te adın altında görünür."
          />
        </label>
        <JoinModeField value={joinMode} onChange={setJoinMode} disabled={busy} />
        {error && (
          <small className="ct-field-error" role="alert">
            <MenuIcon name="alert" size={14} />
            {error}
          </small>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
