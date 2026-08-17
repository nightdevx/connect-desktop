import { useEffect, useState } from "react";
import { Modal, Input } from "antd";
import { LockOutlined } from "@ant-design/icons";

interface LobbyPasswordPromptModalProps {
  // Non-null while a password-protected lobby join is awaiting a password.
  pending: { lobbyId: string; wrong: boolean } | null;
  isJoining: boolean;
  onSubmit: (lobbyId: string, password: string) => void;
  onCancel: () => void;
}

// Prompts for a room join password when the backend reports the lobby is
// password-protected. Kept self-contained so the whole app doesn't need to
// thread password state through the sidebar prop chain.
export function LobbyPasswordPromptModal({
  pending,
  isJoining,
  onSubmit,
  onCancel,
}: LobbyPasswordPromptModalProps) {
  const [password, setPassword] = useState("");

  // Reset the field whenever a NEW prompt opens — keyed on the lobby id, not on
  // the pending object, whose identity changes for reasons that must not wipe
  // what the user is halfway through typing. Reading only the id is what lets
  // the dependency list say exactly that.
  const pendingLobbyId = pending?.lobbyId ?? null;
  useEffect(() => {
    if (pendingLobbyId) {
      setPassword("");
    }
  }, [pendingLobbyId]);

  const handleOk = (): void => {
    if (!pending || password.trim().length === 0) {
      return;
    }
    onSubmit(pending.lobbyId, password);
  };

  return (
    <Modal
      title={
        <span >
          <LockOutlined  />
          Oda Şifresi
        </span>
      }
      open={pending !== null}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Katıl"
      cancelText="İptal"
      okButtonProps={{
        disabled: password.trim().length === 0,
        loading: isJoining,
        // Tokens, not literals: white-on-black is the dark theme's primary
        // button, and on a light page it was a white button with black text
        // sitting on a white panel.
        style: {
          background: "var(--ct-accent)",
          color: "var(--ct-text-inverse)",
          fontWeight: "600",
        },
      }}
      cancelButtonProps={{
        style: {
          background: "transparent",
          borderColor: "var(--ct-border-strong)",
          color: "var(--ct-text-primary)",
        },
      }}
      styles={{
        mask: { backdropFilter: "blur(6px)", background: "var(--ct-scrim)" },
        body: { background: "transparent", color: "var(--ct-text-primary)" },
      }}
    >
      <div >
        <p className="ct-field-hint">
          Bu lobi şifre korumalı. Katılmak için şifreyi girin.
        </p>
        <Input.Password
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Oda şifresi"
          autoFocus
          onPressEnter={handleOk}
          status={pending?.wrong ? "error" : undefined}
        />
        {pending?.wrong && (
          <p className="ct-form-error">
            Şifre yanlış, tekrar deneyin.
          </p>
        )}
      </div>
    </Modal>
  );
}

export default LobbyPasswordPromptModal;
