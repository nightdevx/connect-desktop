import { useState } from "react";
import type { FormEvent } from "react";
import type { LoginRequest } from "../../../shared/auth-contracts";

interface LoginPageProps {
  loading: boolean;
  onSubmit: (payload: LoginRequest) => Promise<void>;
  onGoRegister: () => void;
}

function LoginPage({ loading, onSubmit, onGoRegister }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ username, password });
  };

  return (
    <section className="ct-auth-pane" aria-label="Giriş formu">
      <h2 className="ct-auth-title">Hesaba Giriş</h2>
      <p className="ct-auth-subtitle">
        Discord benzeri hızlı lobi deneyimi için hesabınla devam et.
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
          className="ct-btn-primary mt-1 w-full"
          type="submit"
          disabled={loading}
        >
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
      </form>

      <p className="mt-4 text-sm text-[#8b92b0]">
        Hesabın yok mu?{" "}
        <button type="button" className="ct-link" onClick={onGoRegister}>
          Kayıt Ol
        </button>
      </p>
    </section>
  );
}

export default LoginPage;
