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
          style={{
            background: "rgba(25, 25, 25, 0.85)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          {cancelLabel}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          danger
          loading={isProcessing}
          onClick={onConfirm}
          style={{
            background: "#bdbdbd",
            borderColor: "transparent",
            color: "#0b0b0b",
            fontWeight: 600,
            borderRadius: "8px",
          }}
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
      <p style={{ margin: "16px 0", color: "#c7c7c7", fontSize: "14px", lineHeight: "1.6" }}>
        {message}
      </p>
    </Modal>
  );
}


