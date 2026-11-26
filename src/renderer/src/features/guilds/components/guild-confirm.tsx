import { useState, type ReactNode } from "react";
import { Button, Modal } from "antd";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon, type OdakMenuIcon } from "@/ui/odak-menu";

export interface GuildConfirmRequest {
  title: string;
  /** "Olacaklar": what changes, one sentence each. */
  consequences: string[];
  /** Named after the verb. */
  confirmLabel: string;
  icon?: OdakMenuIcon;
  /** Optional fields under the list (a ban's reason and length). */
  body?: ReactNode;
  run: () => Promise<void>;
}

/**
 * The servers feature's destructive confirm, drawn like the app's other
 * confirms: what will happen, and a red button named after the verb. Focus
 * starts on Vazgeç. Closes itself once `run` resolves; a throw keeps it open.
 */
export function GuildConfirm({ request, onClose }: { request: GuildConfirmRequest | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async (): Promise<void> => {
    if (!request) return;
    setBusy(true);
    try {
      await request.run();
      onClose();
    } catch {
      // run() said why (a toast); the dialog stays for another try.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      rootClassName="ct-modal danger"
      open={request !== null}
      onCancel={onClose}
      width={MODAL_WIDTH.s}
      destroyOnHidden
      title={
        <ModalHeading tone="danger" icon={<MenuIcon name={request?.icon ?? "trash"} size={19} />} title={request?.title} />
      }
      footer={[
        <Button key="cancel" autoFocus onClick={onClose} disabled={busy}>
          Vazgeç
        </Button>,
        <Button key="confirm" type="primary" danger loading={busy} onClick={() => void confirm()}>
          {request?.confirmLabel}
        </Button>,
      ]}
    >
      <div className="ct-confirm-list-title">Olacaklar</div>
      <ul className="ct-confirm-list">
        {request?.consequences.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {request?.body}
    </Modal>
  );
}
