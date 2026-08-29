import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { OTP_CODE_LENGTH, type LoginRequest } from "@shared/auth-contracts";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import { authErrorToast, describeAuthError } from "../auth-error-messages";
import { AuthErrorAlert } from "../components/AuthErrorAlert";

// antd Form hands its callback an untyped object; naming the fields here is
// what makes a renamed <Form.Item name> a compile error rather than an
// undefined that reaches the server.
interface LoginFormValues {
  username: string;
  password: string;
}

interface ForgotPasswordFormValues {
  email: string;
}

interface ResetPasswordFormValues {
  email?: string;
  code: string;
  newPassword: string;
}


const mutedIconStyle = { color: "var(--ct-text-muted)" };

const OTP_PLACEHOLDER = "0".repeat(OTP_CODE_LENGTH);

const normalizeOtp = (value: string | undefined): string =>
  (value ?? "").replace(/\D/g, "").slice(0, OTP_CODE_LENGTH);

interface LoginPageProps {
  loading: boolean;
  /** Resolves with the failure, or null when the sign-in worked. */
  onSubmit: (payload: LoginRequest) => Promise<ApiErrorPayload | null>;
  onGoRegister: () => void;
}

function LoginPage({ loading, onSubmit, onGoRegister }: LoginPageProps) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [submitError, setSubmitError] = useState<ApiErrorPayload | null>(null);

  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    setSubmitError(null);
    const failure = await onSubmit({
      username: values.username,
      password: values.password,
    });
    setSubmitError(failure);

    if (!failure) {
      return;
    }

    // Mark the input the error is actually about, so the message and the field
    // agree instead of the user hunting for which one to change.
    const info = describeAuthError(failure, "login");
    if (info.field && info.field !== "email") {
      form.setFields([{ name: info.field, errors: [info.title] }]);
    }
  };

  // Every manual jump between the three panes clears the remembered address as
  // well as the fields. Leaving it behind hid the e-mail input on a second trip
  // through "Kodum Var", which then submitted the address from the first trip.
  const goToMode = (next: "login" | "forgot" | "reset"): void => {
    setResetEmail("");
    setMode(next);
    form.resetFields();
  };

  const handleForgotPassword = async (values: ForgotPasswordFormValues): Promise<void> => {
    setActionLoading(true);
    try {
      const email = values.email.trim();
      const result = await window.desktopApi.forgotPassword({ email });
      if (result.ok) {
        message.success("Şifre sıfırlama kodu e-postanıza gönderildi!");
        setResetEmail(email);
        setMode("reset");
        form.resetFields();
      } else {
        message.error(authErrorToast(result.error, "recovery"));
      }
    } catch {
      message.error("Bir hata oluştu!");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (values: ResetPasswordFormValues): Promise<void> => {
    setActionLoading(true);
    try {
      const result = await window.desktopApi.resetPassword({
        email: (resetEmail || values.email || "").trim(),
        code: normalizeOtp(values.code),
        newPassword: values.newPassword,
      });
      if (result.ok) {
        message.success("Şifreniz başarıyla sıfırlandı! Yeni şifrenizle giriş yapabilirsiniz.");
        goToMode("login");
      } else {
        message.error(authErrorToast(result.error, "recovery"));
      }
    } catch {
      message.error("Bir hata oluştu!");
    } finally {
      setActionLoading(false);
    }
  };

  if (mode === "forgot") {
    return (
      <section className="ct-auth-pane" aria-label="Şifre sıfırlama e-posta formu">
        <div className="mb-8">
          <h2 className="ct-auth-title text-center">Şifremi Unuttum</h2>
          <p className="ct-auth-subtitle text-center mx-auto">
            Şifrenizi sıfırlamak için hesabınıza kayıtlı e-posta adresini girin.
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleForgotPassword}
          requiredMark={false}
          className="ct-premium-form"
        >
          <Form.Item
            label="E-posta Adresi"
            name="email"
            rules={[
              { required: true, message: "Lütfen e-posta adresinizi girin!" },
              { type: "email", message: "Geçerli bir e-posta adresi girin!" }
            ]}
          >
            <Input
              size="large"
              placeholder="örnek@mail.com"
              className="ct-input-premium"
              prefix={<MailOutlined style={mutedIconStyle} />}
              autoComplete="email"
              autoFocus
            />
          </Form.Item>

          <Form.Item className="mt-6 mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              block
              size="large"
              className="ct-btn-primary"
              
            >
              Doğrulama Kodu Gönder
            </Button>
          </Form.Item>
        </Form>

        <div className="mt-4 flex justify-between items-center text-sm">
          <button type="button" className="ct-link" onClick={() => goToMode("login")}>
            Giriş Ekranına Dön
          </button>
          <button type="button" className="ct-link" onClick={() => goToMode("reset")}>
            Kodum Var
          </button>
        </div>
      </section>
    );
  }

  if (mode === "reset") {
    return (
      <section className="ct-auth-pane" aria-label="Şifre sıfırlama formu">
        <div className="mb-8">
          <h2 className="ct-auth-title text-center">Yeni Şifre Belirle</h2>
          <p className="ct-auth-subtitle text-center mx-auto">
            E-postanıza gönderilen {OTP_CODE_LENGTH} haneli kodu ve yeni şifrenizi girin.
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleResetPassword}
          requiredMark={false}
          className="ct-premium-form"
          initialValues={{ email: resetEmail }}
        >
          {!resetEmail && (
            <Form.Item
              label="E-posta Adresi"
              name="email"
              rules={[
                { required: true, message: "Lütfen e-posta adresinizi girin!" },
                { type: "email", message: "Geçerli bir e-posta adresi girin!" }
              ]}
            >
              <Input
                size="large"
                placeholder="örnek@mail.com"
                className="ct-input-premium"
                prefix={<MailOutlined style={mutedIconStyle} />}
                autoComplete="email"
                autoFocus
              />
            </Form.Item>
          )}

          <Form.Item
            label="Doğrulama Kodu"
            name="code"
            normalize={normalizeOtp}
            rules={[
              { required: true, message: "Lütfen doğrulama kodunu girin!" },
              { len: OTP_CODE_LENGTH, message: `Kod ${OTP_CODE_LENGTH} haneli olmalıdır!` }
            ]}
          >
            <Input
              size="large"
              placeholder={OTP_PLACEHOLDER}
              className="ct-input-premium ct-code-input"
              maxLength={OTP_CODE_LENGTH}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus={!!resetEmail}
            />
          </Form.Item>

          <Form.Item
            label="Yeni Şifre"
            name="newPassword"
            rules={[
              { required: true, message: "Lütfen yeni şifrenizi girin!" },
              { min: 8, message: "Şifre en az 8 karakter olmalıdır!" }
            ]}
          >
            <Input.Password
              size="large"
              placeholder="Yeni şifreniz"
              className="ct-input-premium"
              prefix={<LockOutlined style={mutedIconStyle} />}
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item className="mt-6 mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              block
              size="large"
              className="ct-btn-primary"
              
            >
              Şifreyi Sıfırla
            </Button>
          </Form.Item>
        </Form>

        <p className="mt-4 text-sm">
          <button type="button" className="ct-link" onClick={() => goToMode("login")}>
            Giriş Ekranına Dön
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="ct-auth-pane" aria-label="Giriş formu">
      <div className="mb-8">
        <h2 className="ct-auth-title text-center">Hoş Geldin</h2>
        <p className="ct-auth-subtitle text-center mx-auto">
          Arkadaşlarınla tekrar bağlanmak için hesabına giriş yap.
        </p>
      </div>

      <AuthErrorAlert error={submitError} context="login" />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        className="ct-premium-form"
        // Editing anything means the user is acting on the message; keeping it
        // on screen would leave a stale reason next to changed input.
        onValuesChange={() => setSubmitError(null)}
      >
        <Form.Item
          label="Kullanıcı Adı"
          name="username"
          rules={[
            // Only "not empty". Sign-in must not invent its own rules: an
            // account created before a rule changed would be told its own
            // username is invalid and never get as far as asking the server.
            { required: true, message: "Lütfen kullanıcı adınızı girin!" }
          ]}
        >
          <Input
            size="large"
            placeholder="Kullanıcı adınız"
            className="ct-input-premium"
            prefix={<UserOutlined style={mutedIconStyle} />}
            autoComplete="username"
            autoFocus
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label={
            <div
              className="ct-auth-form-row"
            >
              <span>Şifre</span>
              <button
                type="button"
                onClick={() => goToMode("forgot")}
                className="ct-link-button"
              >
                Şifremi Unuttum
              </button>
            </div>
          }
          name="password"
          rules={[
            // Same reason as the username above: length rules belong to
            // registration. Blocking a short password here only hides the real
            // answer ("bu şifre bu hesaba ait değil") behind a made-up one.
            { required: true, message: "Lütfen şifrenizi girin!" }
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Şifreniz"
            className="ct-input-premium"
            prefix={<LockOutlined style={mutedIconStyle} />}
            autoComplete="current-password"
          />
        </Form.Item>

        <Form.Item className="mt-2 mb-0">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            className="ct-btn-primary"
            
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </Form.Item>
      </Form>

      <p className="mt-6 text-center text-sm" >
        Hesabın yok mu?{" "}
        <button type="button" className="ct-link" onClick={onGoRegister}>
          Kayıt Ol
        </button>
      </p>
    </section>
  );
}

export default LoginPage;
