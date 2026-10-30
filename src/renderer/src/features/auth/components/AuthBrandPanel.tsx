import type { JSX } from "react";
import { SoundOutlined } from "@ant-design/icons";
import { AuthLogoMark } from "./AuthLogoMark";

interface AuthBrandPanelProps {
  /** Sign-in shows what is waiting inside; sign-up and verification show the steps. */
  step: "login" | "register" | "verify";
  version: string;
}

const SIGN_UP_STEPS = [
  { title: "Hesabını oluştur", detail: "E-posta, kullanıcı adı ve şifre" },
  { title: "E-postanı doğrula", detail: "Gelen 6 haneli kodu gir" },
  { title: "Arkadaşlarını ekle", detail: "Kullanıcı adıyla istek gönder" },
];

/**
 * The left half of the sign-in and sign-up screens (Odak). The room and the
 * friend on the sign-in side are an illustration, not data: nothing is known
 * about the user before they sign in, so no count or name here is real.
 */
export function AuthBrandPanel({ step, version }: AuthBrandPanelProps): JSX.Element {
  const current = step === "verify" ? 1 : 0;

  return (
    <aside className="ct-auth-brand" aria-label="Connect">
      <div className="ct-auth-brand-head">
        <span className="ct-auth-brand-tile" aria-hidden="true">
          <AuthLogoMark />
        </span>
        <span className="ct-auth-wordmark">Connect</span>
      </div>

      {step === "login" ? (
        <>
          <h1 className="ct-auth-headline">
            Arkadaşların
            <br />
            <em>çoktan içeride.</em>
          </h1>
          <p className="ct-auth-tagline">
            Sesli sohbet, birlikte film, müzik ve mini oyunlar. Arkadaşlarının takıldığı yer.
          </p>

          <div className="ct-auth-preview" aria-hidden="true">
            <div className="ct-auth-preview-card">
              <div className="ct-auth-preview-row">
                <span className="ct-auth-preview-icon">
                  <SoundOutlined />
                </span>
                <span className="ct-auth-preview-text">
                  <strong>Oyun Odası</strong>
                  <span>4 kişi · Can ekran paylaşıyor</span>
                </span>
                <span className="ct-auth-preview-live">CANLI</span>
              </div>
              <div className="ct-auth-preview-faces">
                <span>A</span>
                <span className="speaking">C</span>
                <span>D</span>
                <span>S</span>
              </div>
            </div>
            <div className="ct-auth-preview-card ct-auth-preview-row">
              <span className="ct-auth-preview-friend">K</span>
              <span className="ct-auth-preview-text">
                <strong>Kaan</strong>
                <span>League of Legends oynuyor</span>
              </span>
              <span className="ct-auth-preview-time">42 dk</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="ct-auth-headline">
            Odan hazır,
            <br />
            <em>sadece sen eksiksin.</em>
          </h1>
          <p className="ct-auth-tagline">
            Bir dakikada hesabını aç, arkadaşlarını ekle, ilk sesli odana katıl.
          </p>

          <ol className="ct-auth-steps">
            {SIGN_UP_STEPS.map((item, index) => (
              <li
                key={item.title}
                className={index === current ? "current" : index < current ? "done" : undefined}
                aria-current={index === current ? "step" : undefined}
              >
                <span className="ct-auth-step-number">{index + 1}</span>
                <span className="ct-auth-preview-text">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
                {index === current && <span className="ct-auth-step-now">ŞİMDİ</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="ct-auth-brand-foot">nightdijital · v{version}</div>
    </aside>
  );
}
