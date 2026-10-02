import type { ReactNode } from "react";
import { Modal, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { ModalHeading } from "@/ui/modal-heading";

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  /** The heading's badge. Defaults to a bin: most confirmations here delete. */
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({
  isOpen,
  title,
  message,
  confirmLabel = "Sil",
  cancelLabel = "İptal",
  isProcessing = false,
  icon = <DeleteOutlined />,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  return (
    // Every confirmation here is irreversible, so the red chrome is the
    // default rather than an option. The mask blur used to be set inline; it
    // is .ct-modal's now, like every other dialog.
    <Modal
      rootClassName="ct-modal danger"
      title={<ModalHeading tone="danger" icon={icon} title={title} />}
      open={isOpen}
      onCancel={onCancel}
      footer={[
        <Button
          key="cancel"
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
          {isProcessing ? "İşleniyor..." : confirmLabel}
        </Button>
      ]}
      width={420}
    >
      <p className="ct-confirm-message">
        {message}
      </p>
    </Modal>
  );
}


