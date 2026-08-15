import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import type { LoginRequest } from "../../../../../shared/auth-contracts";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import { describeAuthError } from "../auth-error-messages";
import { AuthErrorAlert } from "../components/AuthErrorAlert";

const mutedIconStyle = { color: "#6b6b6b" };

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

  const handleSubmit = async (values: any) => {
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

  const handleForgotPassword = async (values: any) => {
    setActionLoading(true);
    try {
      const result = await window.desktopApi.forgotPassword({ email: values.email });
      if (result.ok) {
        message.success("Şifre sıfırlama kodu e-postanıza gönderildi!");
        setResetEmail(values.email);
        setMode("reset");
        form.resetFields();
      } else {
        message.error(result.error?.message || "Kod gönderilemedi!");
      }
    } catch (err) {
      message.error("Bir hata oluştu!");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (values: any) => {
    setActionLoading(true);
    try {
      const result = await window.desktopApi.resetPassword({
        email: resetEmail || values.email,
        code: values.code,
        newPassword: values.newPassword,
      });
      if (result.ok) {
        message.success("Şifreniz başarıyla sıfırlandı! Yeni şifrenizle giriş yapabilirsiniz.");
        setMode("login");
        form.resetFields();
      } else {
        message.error(result.error?.message || "Şifre sıfırlanamadı!");
      }
    } catch (err) {
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
          <button type="button" className="ct-link" onClick={() => { setMode("login"); form.resetFields(); }}>
            Giriş Ekranına Dön
          </button>
          <button type="button" className="ct-link" onClick={() => { setMode("reset"); form.resetFields(); }}>
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
            E-postanıza gönderilen 6 haneli kodu ve yeni şifrenizi girin.
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
            rules={[
              { required: true, message: "Lütfen doğrulama kodunu girin!" },
              { len: 6, message: "Kod 6 haneli olmalıdır!" }
            ]}
          >
            <Input
              size="large"
              placeholder="000000"
              className="ct-input-premium ct-code-input"
              maxLength={6}
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
          <button type="button" className="ct-link" onClick={() => { setMode("login"); form.resetFields(); }}>
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
                onClick={() => { setMode("forgot"); form.resetFields(); }}
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
