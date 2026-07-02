import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { User, Lock, Mail } from "lucide-react";
import type { LoginRequest } from "../../../../../shared/auth-contracts";

const mutedIconStyle = { color: "#6b6b6b" };

interface LoginPageProps {
  loading: boolean;
  onSubmit: (payload: LoginRequest) => Promise<void>;
  onGoRegister: () => void;
}

function LoginPage({ loading, onSubmit, onGoRegister }: LoginPageProps) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    await onSubmit({ username: values.username, password: values.password });
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
              prefix={<Mail size={16} style={mutedIconStyle} />}
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
              style={{
                height: "48px",
                borderRadius: "14px",
                fontWeight: 700,
                fontSize: "14px",
                letterSpacing: "0.02em"
              }}
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
                prefix={<Mail size={16} style={mutedIconStyle} />}
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
              className="ct-input-premium"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus={!!resetEmail}
              style={{ letterSpacing: "8px", textAlign: "center", fontWeight: "bold" }}
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
              prefix={<Lock size={16} style={mutedIconStyle} />}
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
              style={{
                height: "48px",
                borderRadius: "14px",
                fontWeight: 700,
                fontSize: "14px",
                letterSpacing: "0.02em"
              }}
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

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        className="ct-premium-form"
      >
        <Form.Item
          label="Kullanıcı Adı"
          name="username"
          rules={[
            { required: true, message: "Lütfen kullanıcı adınızı girin!" },
            { min: 3, message: "Kullanıcı adı en az 3 karakter olmalıdır!" },
            { max: 64, message: "Kullanıcı adı en fazla 64 karakter olmalıdır!" }
          ]}
        >
          <Input
            size="large"
            placeholder="Kullanıcı adınız"
            className="ct-input-premium"
            prefix={<User size={16} style={mutedIconStyle} />}
            autoComplete="username"
            autoFocus
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <span>Şifre</span>
              <button
                type="button"
                onClick={() => { setMode("forgot"); form.resetFields(); }}
                style={{
                  textTransform: "none",
                  letterSpacing: "normal",
                  fontWeight: 500,
                  fontSize: "11px",
                  color: "#9a9a9a",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Şifremi Unuttum
              </button>
            </div>
          }
          name="password"
          rules={[
            { required: true, message: "Lütfen şifrenizi girin!" },
            { min: 8, message: "Şifre en az 8 karakter olmalıdır!" },
            { max: 256, message: "Şifre en fazla 256 karakter olmalıdır!" }
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Şifreniz"
            className="ct-input-premium"
            prefix={<Lock size={16} style={mutedIconStyle} />}
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
            style={{
              height: "48px",
              borderRadius: "14px",
              fontWeight: 700,
              fontSize: "14px",
              letterSpacing: "0.02em"
            }}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </Form.Item>
      </Form>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
        Hesabın yok mu?{" "}
        <button type="button" className="ct-link" onClick={onGoRegister}>
          Kayıt Ol
        </button>
      </p>
    </section>
  );
}

export default LoginPage;
