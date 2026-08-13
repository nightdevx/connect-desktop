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

  // Reset the field whenever a new prompt opens.
  useEffect(() => {
    if (pending) {
      setPassword("");
    }
  }, [pending?.lobbyId]);

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
        style: { background: "#ffffff", color: "#000000", fontWeight: "600" },
      }}
      cancelButtonProps={{
        style: {
          background: "transparent",
          borderColor: "rgba(255,255,255,0.15)",
          color: "#ffffff",
        },
      }}
      styles={{
        mask: { backdropFilter: "blur(6px)", background: "rgba(0, 0, 0, 0.6)" },
        body: { background: "transparent", color: "#f5f5f5" },
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
