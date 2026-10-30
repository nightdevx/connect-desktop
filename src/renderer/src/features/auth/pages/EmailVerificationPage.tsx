import { useState } from "react";
import { Form, Input, Button } from "antd";
import { MailOutlined, SafetyOutlined } from "@ant-design/icons";
import { OTP_CODE_LENGTH } from "@shared/auth-contracts";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import { authService } from "../services/service";
import { AuthErrorAlert } from "../components/AuthErrorAlert";
import { toast } from "@/services/toast";

// Shown in place of the workspace once the backend answers
// EMAIL_VERIFICATION_REQUIRED: the server requires a verified address from an
// allowed domain and refuses everything else until there is one, so the
// settings page (where the address is normally verified) cannot even load.

const mutedIconStyle = { color: "var(--ct-text-muted)" };

interface EmailVerificationPageProps {
  onVerified: () => void;
  onLogout: () => void;
}

export default function EmailVerificationPage({ onVerified, onLogout }: EmailVerificationPageProps) {
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiErrorPayload | null>(null);

  const sendCode = async (address: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.sendVerificationOTP({ email: address.trim() });
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      setEmail(address.trim());
      setCodeSent(true);
      toast.success("Doğrulama kodu e-posta adresine gönderildi.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.verifyEmail({ email, code: code.trim() });
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      toast.success("E-posta adresin doğrulandı.");
      onVerified();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ct-auth-pane" aria-label="E-posta doğrulama formu">
      <div className="mb-8">
        <h2 className="ct-auth-title">E-postanı doğrula</h2>
        <p className="ct-auth-subtitle">
          {codeSent
            ? `${email} adresine gelen ${OTP_CODE_LENGTH} haneli kodu yaz.`
            : "Bu sunucu devam etmeden önce doğrulanmış bir e-posta adresi istiyor. Adresini yaz, sana bir kod gönderelim."}
        </p>
      </div>

      <AuthErrorAlert error={error} context="recovery" />

      {codeSent ? (
        <Form
          key="code"
          layout="vertical"
          requiredMark={false}
          className="ct-premium-form"
          onFinish={(values: { code: string }) => void verify(values.code)}
        >
          <Form.Item
            label="Doğrulama kodu"
            name="code"
            rules={[
              { required: true, message: "Lütfen doğrulama kodunu girin!" },
              { len: OTP_CODE_LENGTH, message: `${OTP_CODE_LENGTH} haneli kodu girin!` },
            ]}
          >
            <Input
              size="large"
              placeholder={"0".repeat(OTP_CODE_LENGTH)}
              className="ct-input-premium ct-code-input"
              prefix={<SafetyOutlined style={mutedIconStyle} />}
              maxLength={OTP_CODE_LENGTH}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
          </Form.Item>
          <Form.Item className="mt-6 mb-0">
            <Button type="primary" htmlType="submit" loading={loading} block size="large" className="ct-btn-primary">
              Doğrula
            </Button>
          </Form.Item>
        </Form>
      ) : (
        <Form
          key="email"
          layout="vertical"
          requiredMark={false}
          className="ct-premium-form"
          onFinish={(values: { email: string }) => void sendCode(values.email)}
        >
          <Form.Item
            label="E-posta"
            name="email"
            rules={[
              { required: true, message: "Lütfen e-posta adresini girin!" },
              { type: "email", message: "Geçerli bir e-posta adresi girin!" },
            ]}
          >
            <Input
              size="large"
              placeholder="ornek@mail.com"
              className="ct-input-premium"
              prefix={<MailOutlined style={mutedIconStyle} />}
              autoComplete="email"
              autoFocus
            />
          </Form.Item>
          <Form.Item className="mt-6 mb-0">
            <Button type="primary" htmlType="submit" loading={loading} block size="large" className="ct-btn-primary">
              Kod gönder
            </Button>
          </Form.Item>
        </Form>
      )}

      <p className="mt-4 text-sm">
        {codeSent && (
          <>
            <button type="button" className="ct-link" onClick={() => void sendCode(email)} disabled={loading}>
              Kodu yeniden gönder
            </button>
            {" · "}
            <button type="button" className="ct-link" onClick={() => setCodeSent(false)}>
              Adresi değiştir
            </button>
            {" · "}
          </>
        )}
        <button type="button" className="ct-link" onClick={onLogout}>
          Çıkış yap
        </button>
      </p>
    </section>
  );
}
