import { Form, Input, Button } from "antd";
import type { LoginRequest } from "../../../shared/auth-contracts";

interface LoginPageProps {
  loading: boolean;
  onSubmit: (payload: LoginRequest) => Promise<void>;
  onGoRegister: () => void;
}

function LoginPage({ loading, onSubmit, onGoRegister }: LoginPageProps) {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    await onSubmit({ username: values.username, password: values.password });
  };

  return (
    <section className="ct-auth-pane" aria-label="Giriş formu">
      <h2 className="ct-auth-title">Hesaba Giriş</h2>
      <p className="ct-auth-subtitle">
        Discord benzeri hızlı lobi deneyimi için hesabınla devam et.
      </p>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item
          label={<span className="text-sm font-semibold text-[#c7c7c7]">Kullanıcı Adı</span>}
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
            style={{
              background: "#0d0d0d",
              borderColor: "rgba(255, 255, 255, 0.08)",
              color: "#f5f5f5"
            }}
          />
        </Form.Item>

        <Form.Item
          label={<span className="text-sm font-semibold text-[#c7c7c7]">Şifre</span>}
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
            style={{
              background: "#0d0d0d",
              borderColor: "rgba(255, 255, 255, 0.08)",
              color: "#f5f5f5"
            }}
          />
        </Form.Item>

        <Form.Item className="mt-6 mb-0">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            style={{
              height: "44px",
              borderRadius: "12px",
              fontWeight: 600,
            }}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </Form.Item>
      </Form>

      <p className="mt-4 text-sm text-[#8f8f8f]">
        Hesabın yok mu?{" "}
        <button type="button" className="ct-link" onClick={onGoRegister}>
          Kayıt Ol
        </button>
      </p>
    </section>
  );
}

export default LoginPage;
