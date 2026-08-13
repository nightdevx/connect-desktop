import { Modal, Button } from "antd";

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
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
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  return (
    <Modal
      title={<span className="text-base font-bold text-[#f5f5f5]">{title}</span>}
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
      styles={{
        mask: {
          backdropFilter: "blur(6px)",
          background: "rgba(0, 0, 0, 0.7)",
        },
      }}
      width={400}
    >
      <p className="ct-confirm-message">
        {message}
      </p>
    </Modal>
  );
}


