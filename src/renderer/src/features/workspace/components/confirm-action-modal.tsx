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
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="ct-user-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (isProcessing) {
          return;
        }

        onCancel();
      }}
    >
      <section
        className="ct-user-popup"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ct-user-popup-header">
          <h4>{title}</h4>
        </header>

        <p className="ct-confirm-message">{message}</p>

        <div className="ct-action-row">
          <button
            type="button"
            className="ct-btn-primary ct-btn-danger"
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "İşleniyor..." : confirmLabel}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
