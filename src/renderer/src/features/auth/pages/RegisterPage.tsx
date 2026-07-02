import { Form, Input, Button } from "antd";
import { User, Lock, Mail } from "lucide-react";
import type { RegisterRequest } from "../../../../../shared/auth-contracts";

const mutedIconStyle = { color: "#6b6b6b" };

interface RegisterPageProps {
  loading: boolean;
  onSubmit: (payload: RegisterRequest) => Promise<void>;
  onGoLogin: () => void;
}

function RegisterPage({ loading, onSubmit, onGoLogin }: RegisterPageProps) {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    await onSubmit({
      email: values.email,
      username: values.username,
      password: values.password
    });
  };

  return (
    <section className="ct-auth-pane" aria-label="Kayıt formu">
      <div className="mb-8">
        <h2 className="ct-auth-title text-center">Aramıza Katıl</h2>
        <p className="ct-auth-subtitle text-center mx-auto">
          Kendi topluluğunu kurmak için saniyeler içinde kayıt ol.
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
          label="E-posta Adresi"
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
            prefix={<Mail size={16} style={mutedIconStyle} />}
            autoComplete="email"
            autoFocus
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label="Kullanıcı Adı"
          name="username"
          rules={[
            { required: true, message: "Lütfen kullanıcı adı girin!" },
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
            spellCheck={false}
          />
        </Form.Item>

        <Form.Item
          label="Şifre"
          name="password"
          rules={[
            { required: true, message: "Lütfen şifre girin!" },
            { min: 8, message: "Şifre en az 8 karakter olmalıdır!" },
            { max: 256, message: "Şifre en fazla 256 karakter olmalıdır!" }
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Şifreniz"
            className="ct-input-premium"
            prefix={<Lock size={16} style={mutedIconStyle} />}
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item
          label="Şifre Tekrar"
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
            prefix={<Lock size={16} style={mutedIconStyle} />}
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
            style={{
              height: "48px",
              borderRadius: "14px",
              fontWeight: 700,
              fontSize: "14px",
              letterSpacing: "0.02em"
            }}
          >
            {loading ? "Kayıt olunuyor..." : "Kayıt Ol"}
          </Button>
        </Form.Item>
      </Form>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
        Zaten hesabın var mı?{" "}
        <button type="button" className="ct-link" onClick={onGoLogin}>
          Giriş Yap
        </button>
      </p>
    </section>
  );
}

export default RegisterPage;
