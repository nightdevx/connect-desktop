import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Modal, Button } from "antd";
import { DeleteOutlined, UserDeleteOutlined } from "@ant-design/icons";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { Avatar } from "../odak/odak-parts";

/** Who the action is about, shown as a row above what will happen. */
export interface ConfirmSubject {
  userId: string;
  name: string;
  /** Without the @. */
  handle?: string;
  avatarUrl?: string | null;
  /** A short fact on the right ("Arkadaş"). */
  detail?: string;
}

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  /** One line under the title. Optional when `consequences` says it all. */
  message?: string;
  subject?: ConfirmSubject;
  /** "Olacaklar": what changes, one sentence each. */
  consequences?: string[];
  /** Named after the verb: "Sil", "Arkadaşlıktan çıkar". */
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  /** The heading's badge. Defaults to a bin: most confirmations here delete. */
  icon?: ReactNode;
  /** Optional body under the list (a reason field). */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The destructive confirm: who, what will happen, and a red button named after
 * the verb. Focus opens on Vazgeç, so a stray Enter never does the damage.
 */
export function ConfirmActionModal({
  isOpen,
  title,
  message,
  subject,
  consequences,
  confirmLabel = "Sil",
  cancelLabel = "Vazgeç",
  isProcessing = false,
  icon = <DeleteOutlined />,
  children,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Callers clear what they confirm (the person, the room) to close, so the
  // body would empty out under the close motion. It keeps the last open copy.
  const live = { message, subject, consequences };
  const [last, setLast] = useState(live);
  if (
    isOpen &&
    (last.message !== message || last.subject !== subject || last.consequences !== consequences)
  ) {
    setLast(live);
  }
  const shown = isOpen ? live : last;

  return (
    <Modal
      rootClassName="ct-modal danger"
      title={<ModalHeading tone="danger" icon={icon} title={title} description={shown.message} />}
      open={isOpen}
      onCancel={onCancel}
      // autoFocus covers the first paint; this covers antd moving focus to the
      // panel once the open motion ends.
      afterOpenChange={(open) => {
        if (open && !cancelRef.current?.closest(".ant-modal-wrap")?.contains(document.activeElement)) {
          cancelRef.current?.focus();
        }
      }}
      footer={[
        <Button
          key="cancel"
          ref={cancelRef}
          autoFocus
          onClick={onCancel}
          disabled={isProcessing}
        >
          {cancelLabel}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          danger
          loading={isProcessing}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>,
      ]}
      width={MODAL_WIDTH.s}
      destroyOnHidden
    >
      {shown.subject && (
        <div className="ct-confirm-subject">
          <Avatar
            userId={shown.subject.userId}
            name={shown.subject.name}
            avatarUrl={shown.subject.avatarUrl}
            className="ct-confirm-subject-avatar"
          />
          <span className="ct-confirm-subject-name">
            <strong>{shown.subject.name}</strong>
            {shown.subject.handle && <span>@{shown.subject.handle}</span>}
          </span>
          {shown.subject.detail && (
            <span className="ct-confirm-subject-detail">{shown.subject.detail}</span>
          )}
        </div>
      )}
      {shown.consequences && shown.consequences.length > 0 && (
        <>
          <div className="ct-confirm-list-title">Olacaklar</div>
          <ul className="ct-confirm-list">
            {shown.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {children}
    </Modal>
  );
}

/** The one unfriend confirm: the friends page and the stage menu both open it. */
export function UnfriendConfirmModal({
  person,
  isProcessing,
  onConfirm,
  onCancel,
}: {
  person: { userId: string; name: string; username?: string; avatarUrl?: string | null } | null;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmActionModal
      isOpen={person !== null}
      title="Arkadaşlıktan çıkar"
      icon={<UserDeleteOutlined />}
      subject={
        person
          ? {
              userId: person.userId,
              name: person.name,
              handle: person.username,
              avatarUrl: person.avatarUrl,
              detail: "Arkadaş",
            }
          : undefined
      }
      consequences={[
        "Arkadaş listenden çıkar.",
        "Ayarın “Sadece arkadaşlarım” ise sana yazamaz, seni arayamaz.",
        "Geri almak için yeni bir istek göndermen ve kabul etmesi gerekir.",
      ]}
      confirmLabel="Arkadaşlıktan çıkar"
      isProcessing={isProcessing}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
