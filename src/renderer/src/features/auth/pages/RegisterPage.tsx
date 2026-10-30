import { useState } from "react";
import { Form, Input, Button } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { RegisterRequest } from "@shared/auth-contracts";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import { describeAuthError } from "../auth-error-messages";
import { AuthErrorAlert } from "../components/AuthErrorAlert";

// See LoginPage: antd Form callbacks are untyped, so the field names are
// declared once here instead of being trusted at each read.
interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
}


interface RegisterPageProps {
  loading: boolean;
  /** Resolves with the failure, or null when the account was created. */
  onSubmit: (payload: RegisterRequest) => Promise<ApiErrorPayload | null>;
  onGoLogin: () => void;
}

function RegisterPage({ loading, onSubmit, onGoLogin }: RegisterPageProps) {
  const [form] = Form.useForm();
  const [submitError, setSubmitError] = useState<ApiErrorPayload | null>(null);

  const handleSubmit = async (values: RegisterFormValues): Promise<void> => {
    setSubmitError(null);
    const failure = await onSubmit({
      email: values.email,
      username: values.username,
      password: values.password,
    });
    setSubmitError(failure);

    if (!failure) {
      return;
    }

    // Register rejects one specific field at a time — taken username, malformed
    // e-mail, too-long password. Mark it, so the explanation and the input the
    // user has to change are in the same place.
    const info = describeAuthError(failure, "register");
    if (info.field) {
      form.setFields([{ name: info.field, errors: [info.title] }]);
    }
  };

  return (
    <section className="ct-auth-pane" aria-label="Kayıt formu">
      <div className="mb-8">
        <h2 className="ct-auth-title">Aramıza katıl</h2>
        <p className="ct-auth-subtitle">
          Kendi topluluğunu kurmak için saniyeler içinde kayıt ol.
        </p>
      </div>

      <AuthErrorAlert error={submitError} context="register" />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        className="ct-premium-form"
        onValuesChange={() => setSubmitError(null)}
      >
        <Form.Item
          label="E-posta"
          name="email"
          rules={[
            { required: true, message: "Lütfen e-posta adresi girin!" },
            { type: "email", message: "Geçerli bir e-posta adresi girin!" },
            { max: 128, message: "E-posta en fazla 128 karakter olmalıdır!" }
          ]}
        >
          <Input
            size="large"
            placeholder="örnek@mail.com"
            className="ct-input-premium"
            autoComplete="email"
            autoFocus
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label="Kullanıcı adı"
          name="username"
          extra="3–32 karakter · küçük harf, rakam ve _ - ."
          rules={[
            // Mirrors the server exactly (3-32, [a-z0-9_.-]). It used to allow
            // up to 64 and any character, so a 40-character or capitalised name
            // passed here and was rejected by the backend with a different
            // reason — the form said one thing, the server another.
            { required: true, message: "Lütfen kullanıcı adı girin!" },
            { min: 3, message: "Kullanıcı adı en az 3 karakter olmalıdır!" },
            { max: 32, message: "Kullanıcı adı en fazla 32 karakter olmalıdır!" },
            {
              pattern: /^[a-z0-9_.-]+$/,
              message: "Sadece küçük harf, rakam ve _ - . kullanın.",
            }
          ]}
        >
          <Input
            size="large"
            placeholder="kullanici_adin"
            className="ct-input-premium"
            prefix={<span className="ct-auth-at">@</span>}
            autoComplete="username"
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label="Şifre"
          name="password"
          extra="En az 8 karakter"
          rules={[
            { required: true, message: "Lütfen şifre girin!" },
            { min: 8, message: "Şifre en az 8 karakter olmalıdır!" },
            // bcrypt refuses anything over 72 bytes; a longer password used to
            // pass validation here and fail server-side with a bare 500.
            { max: 72, message: "Şifre en fazla 72 karakter olmalıdır!" }
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Şifreniz"
            className="ct-input-premium"
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item
          label="Şifre tekrar"
          name="confirmPassword"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Lütfen şifrenizi tekrar girin!" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("Şifreler eşleşmiyor!"));
              },
            }),
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Şifrenizi tekrar girin"
            className="ct-input-premium"
            autoComplete="new-password"
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
            {loading ? "Kayıt olunuyor..." : (
              <>
                Hesap oluştur <ArrowRightOutlined />
              </>
            )}
          </Button>
        </Form.Item>
      </Form>

      <div className="ct-auth-switch">
        <span>Zaten hesabın var mı?</span>
        <button type="button" className="ct-auth-switch-button" onClick={onGoLogin}>
          Giriş yap
        </button>
      </div>
    </section>
  );
}

export default RegisterPage;
