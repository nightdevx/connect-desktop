import { Form, Input, Button } from "antd";
import type { RegisterRequest } from "../../../../../shared/auth-contracts";

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
          />
        </Form.Item>

        <Form.Item
          label={<span className="text-sm font-semibold text-[#c7c7c7]">Şifre</span>}
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
          />
        </Form.Item>

        <Form.Item className="mt-6 mb-0">
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

    </section>
  );
}

export default RegisterPage;
