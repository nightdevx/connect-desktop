import { useEffect, useRef, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import type { AppUpdateSnapshot } from "@shared/update-contracts";
import { AuthLogoMark } from "@/features/auth";

/**
 * The lock a mandatory update puts on the app.
 *
 * Covers everything under the titlebar -- the titlebar stays usable so the
 * window can still be moved, minimised and closed -- and has no way out but
 * the update itself. "Tamam" installs at once if the download has finished,
 * and otherwise tells the main process to install the moment it does, so the
 * user confirms once and does not have to wait to be asked again.
 */
export function UpdateGate({ state }: { state: AppUpdateSnapshot }) {
  const [confirmed, setConfirmed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const failed = state.phase === "error";
  const installing = state.phase === "installing";
  const downloading = state.phase === "downloading";
  const percent = typeof state.progressPercent === "number" ? state.progressPercent : null;

  // Enter confirms: the gate is the only thing on screen that does anything.
  useEffect(() => {
    buttonRef.current?.focus();
  }, [failed]);

  const status = installing
    ? "Kuruluyor. Connect birazdan yeniden açılacak."
    : failed
      ? "Güncelleme indirilemedi. İnternet bağlantını kontrol edip tekrar dene."
      : state.phase === "downloaded"
        ? "Güncelleme hazır."
        : downloading
          ? `İndiriliyor${percent === null ? "" : ` %${Math.round(percent)}`}${
              confirmed ? " · bitince kendiliğinden kurulacak" : ""
            }`
          : confirmed
            ? "Güncelleme hazırlanıyor · bitince kendiliğinden kurulacak"
            : "Güncelleme hazırlanıyor…";

  return (
    <div
      className="ct-update-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ct-update-gate-title"
      aria-describedby="ct-update-gate-text"
    >
      <section className="ct-update-gate-card">
        <AuthLogoMark className="ct-logomark--badge" />

        <h2 id="ct-update-gate-title">Zorunlu güncelleme</h2>
        <p id="ct-update-gate-text">
          Connect {state.nextVersion ? `v${state.nextVersion}` : "yeni sürümü"} yayınlandı.
          Uygulamayı kullanmaya devam etmek için güncellemen gerekiyor.
        </p>

        {downloading && (
          <div className="ct-update-gate-progress" aria-hidden="true">
            <span style={{ width: `${percent ?? 0}%` }} />
          </div>
        )}

        <p className="ct-update-gate-status" aria-live="polite">
          {status}
        </p>

        {failed ? (
          <button
            ref={buttonRef}
            type="button"
            className="ct-btn-secondary ct-update-gate-action"
            onClick={() => {
              void window.desktopApi.checkForAppUpdates();
            }}
          >
            <ReloadOutlined /> Tekrar dene
          </button>
        ) : (
          <button
            ref={buttonRef}
            type="button"
            className="ct-btn-primary ct-update-gate-action"
            // Not disabled once pressed: a second press is harmless, and a
            // failed install drops back to "downloaded" needing exactly that.
            disabled={installing}
            onClick={() => {
              setConfirmed(true);
              void window.desktopApi.installDownloadedUpdate();
            }}
          >
            Tamam, güncelle
          </button>
        )}
      </section>
    </div>
  );
}
