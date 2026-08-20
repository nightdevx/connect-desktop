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
    // rootClassName, like every other modal in the app. This one used to
    // re-implement .ct-modal inline — its own mask blur, its own primary-button
    // palette, its own body colours — so it was the one dialog that did not
    // follow the theme when the shared rules changed.
    <Modal
      rootClassName="ct-modal"
      title={
        <span className="ct-modal-title-icon">
          <LockOutlined />
          Oda Şifresi
        </span>
      }
      open={pending !== null}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Katıl"
      cancelText="İptal"
      destroyOnHidden
      okButtonProps={{
        disabled: password.trim().length === 0,
        loading: isJoining,
      }}
    >
      <div className="ct-modal-form">
        <p className="ct-field-hint">
          Bu lobi şifre korumalı. Katılmak için şifreyi girin.
        </p>

        <label className="ct-field" htmlFor="lobby-join-password">
          <span>Oda Şifresi</span>
          <Input.Password
            id="lobby-join-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Oda şifresi"
            autoFocus
            onPressEnter={handleOk}
            status={pending?.wrong ? "error" : undefined}
          />
        </label>

        {pending?.wrong && (
          <p className="ct-form-error">Şifre yanlış, tekrar deneyin.</p>
        )}
      </div>
    </Modal>
  );
}

export default LobbyPasswordPromptModal;
