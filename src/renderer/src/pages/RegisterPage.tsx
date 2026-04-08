import { useState } from "react";
import type { FormEvent } from "react";
import type { RegisterRequest } from "../../../shared/auth-contracts";

interface RegisterPageProps {
  loading: boolean;
  onSubmit: (payload: RegisterRequest) => Promise<void>;
  onGoLogin: () => void;
}

function RegisterPage({ loading, onSubmit, onGoLogin }: RegisterPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ username, password });
  };

  return (
    <section className="ct-auth-pane" aria-label="Kayıt formu">
      <h2 className="ct-auth-title">Yeni Hesap</h2>
      <p className="ct-auth-subtitle">
        Arkadaş grubun için saniyeler içinde bir hesap oluştur.
      </p>

      <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
        <label className="ct-label">
          Kullanıcı Adı
          <input
            type="text"
            minLength={3}
            maxLength={64}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="ct-input"
            required
          />
        </label>

        <label className="ct-label">
          Şifre
          <input
            type="password"
            minLength={8}
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="ct-input"
            required
          />
        </label>

        <button
          className="ct-btn-warn mt-1 w-full"
          type="submit"
          disabled={loading}
        >
          {loading ? "Kayıt olunuyor..." : "Kayıt Ol"}
        </button>
      </form>

      <p className="mt-4 text-sm text-[#8b92b0]">
        Zaten hesabın var mı?{" "}
        <button type="button" className="ct-link" onClick={onGoLogin}>
          Giriş Yap
        </button>
      </p>
    </section>
  );
}

export default RegisterPage;
