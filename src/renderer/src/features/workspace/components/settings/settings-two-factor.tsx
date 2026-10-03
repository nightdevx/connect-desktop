import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Input, Modal, QRCode, Tag } from "antd";
import {
  CopyOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import type { TwoFactorSetup, TwoFactorStatus } from "@shared/auth-contracts";
import { authService } from "@/features/auth";
import { ModalHeading } from "@/ui/modal-heading";
import { toast } from "@/services/toast";
import { SettingsGroup, SettingsRow } from "./settings-layout";

// What each refusal means to the person at the keyboard. Keyed on the code the
// backend sends; its own message text is for developers.
const TWO_FACTOR_ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Şifre yanlış.",
  TOTP_INVALID: "Kod yanlış ya da daha önce kullanılmış. Uygulamadaki güncel kodu gir.",
  TOTP_SETUP_EXPIRED: "Kurulumun süresi doldu. Baştan başla.",
  TOTP_ALREADY_ENABLED: "İki adımlı doğrulama zaten açık.",
  TOTP_REQUIRED_FOR_ADMIN: "Yönetici hesaplarında iki adımlı doğrulama kapatılamaz.",
  TOO_MANY_REQUESTS: "Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.",
};

const describe = (error: ApiErrorPayload | undefined, fallback: string): string =>
  (error?.code && TWO_FACTOR_ERRORS[error.code]) || fallback;

// The secret in fours, the way authenticator apps show and accept it.
const groupSecret = (secret: string): string => secret.replace(/(.{4})(?=.)/g, "$1 ");

const copyText = async (text: string, done: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Kopyalanamadı; elle seçip kopyala.");
  }
};

type ConfirmAction = "disable" | "regenerate";

/**
 * Two-step sign-in: a code from an authenticator app on top of the password.
 * Optional for members; required for admin and owner accounts, whose admin
 * routes refuse to work until it is on and who cannot turn it off.
 */
export function SettingsTwoFactor() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);

  // Enabling: password, then the scan and the first code, then the codes.
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupPassword, setSetupPassword] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Codes shown once, after enabling or regenerating.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);

  // Turning off, or new recovery codes: both re-ask password and a code.
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");

  const load = useCallback(async () => {
    const result = await authService.twoFactorStatus();
    // A server older than two-step sign-in has no such route; the group then
    // stays hidden rather than offering something that cannot work.
    setStatus(result.ok && result.data ? result.data : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeSetup = (): void => {
    setSetupOpen(false);
    setSetupPassword("");
    setSetup(null);
    setSetupCode("");
  };

  const handleSetupStart = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await authService.twoFactorSetup(setupPassword);
      if (!result.ok || !result.data) {
        toast.error(describe(result.error, "Kurulum başlatılamadı."));
        return;
      }
      setSetup(result.data);
      setSetupPassword("");
    } finally {
      setBusy(false);
    }
  };

  const handleSetupFinish = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await authService.twoFactorEnable(setupCode.trim());
      if (!result.ok || !result.data) {
        toast.error(describe(result.error, "İki adımlı doğrulama açılamadı."));
        if (result.error?.code === "TOTP_SETUP_EXPIRED") {
          setSetup(null);
          setSetupCode("");
        }
        return;
      }
      closeSetup();
      setCodesSaved(false);
      setRecoveryCodes(result.data.recoveryCodes);
      toast.success("İki adımlı doğrulama açıldı.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const closeConfirm = (): void => {
    setConfirmAction(null);
    setConfirmPassword("");
    setConfirmCode("");
  };

  const handleConfirm = async (): Promise<void> => {
    const payload = { password: confirmPassword, code: confirmCode.trim() };
    setBusy(true);
    try {
      if (confirmAction === "disable") {
        const result = await authService.twoFactorDisable(payload);
        if (!result.ok) {
          toast.error(describe(result.error, "İki adımlı doğrulama kapatılamadı."));
          return;
        }
        toast.success("İki adımlı doğrulama kapatıldı.");
      } else {
        const result = await authService.twoFactorRecoveryCodes(payload);
        if (!result.ok || !result.data) {
          toast.error(describe(result.error, "Yeni kodlar oluşturulamadı."));
          return;
        }
        setCodesSaved(false);
        setRecoveryCodes(result.data.recoveryCodes);
      }
      closeConfirm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return null;
  }

  return (
    <>
      <SettingsGroup
        title="İki adımlı doğrulama"
        description="Girişte şifrenin yanında telefonundaki doğrulama uygulamasının (Google Authenticator, Microsoft Authenticator gibi) ürettiği kod da istenir. Şifren ele geçse bile hesabına girilemez."
        action={
          status.enabled ? (
            <Tag color="success" icon={<SafetyCertificateOutlined />}>
              Açık
            </Tag>
          ) : (
            <Tag icon={<StopOutlined />}>Kapalı</Tag>
          )
        }
      >
        {status.required && !status.enabled ? (
          <p className="ct-settings-two-factor-required">
            Yönetici hesaplarında zorunlu: açana kadar yönetim paneli kullanılamaz.
          </p>
        ) : null}

        {status.enabled ? (
          <>
            <SettingsRow
              icon={<KeyOutlined />}
              title="Kurtarma kodları"
              description={`Telefonun yanında değilken giriş için. Kalan: ${status.recoveryCodesLeft}. Yenileri eskilerin hepsini geçersiz kılar.`}
            >
              <Button onClick={() => setConfirmAction("regenerate")}>Yeni kodlar</Button>
            </SettingsRow>
            <SettingsRow
              icon={<StopOutlined />}
              title="Kapat"
              description={
                status.required
                  ? "Yönetici hesaplarında kapatılamaz."
                  : "Giriş yeniden yalnızca şifreyle yapılır."
              }
            >
              <Button
                danger
                disabled={status.required}
                onClick={() => setConfirmAction("disable")}
              >
                Kapat
              </Button>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow
            icon={<SafetyCertificateOutlined />}
            title="Aç"
            description="Uygulamayla bir QR kod taratıp verdiği ilk kodu girmen yeterli."
          >
            <Button type="primary" onClick={() => setSetupOpen(true)}>
              Aç
            </Button>
          </SettingsRow>
        )}
      </SettingsGroup>

      <Modal
        rootClassName="ct-modal"
        open={setupOpen}
        destroyOnHidden
        title={
          <ModalHeading
            icon={<SafetyCertificateOutlined />}
            title="İki Adımlı Doğrulamayı Aç"
            description={
              setup
                ? "Doğrulama uygulamasıyla QR kodu tarat, sonra uygulamanın gösterdiği 6 haneli kodu yaz."
                : "Devam etmek için şifreni gir."
            }
          />
        }
        okText={setup ? "Doğrula ve aç" : "Devam"}
        cancelText="Vazgeç"
        confirmLoading={busy}
        okButtonProps={{
          disabled: setup ? !/^\d{6}$/.test(setupCode.trim()) : setupPassword.length < 8,
        }}
        onCancel={closeSetup}
        onOk={() => {
          void (setup ? handleSetupFinish() : handleSetupStart());
        }}
      >
        <div className="ct-modal-form">
          {setup ? (
            <>
              <div className="ct-two-factor-qr">
                {/* Drawn here from the otpauth URL: the secret never leaves the
                    app for a QR service. White ground, so every camera reads it. */}
                <QRCode value={setup.otpauthUrl} size={176} color="#000000" bgColor="#ffffff" />
              </div>
              <div className="ct-settings-field">
                <span className="ct-field-label">Tarayamıyorsan bu anahtarı elle gir</span>
                <div className="ct-two-factor-secret">
                  <code>{groupSecret(setup.secret)}</code>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void copyText(setup.secret, "Anahtar kopyalandı.");
                    }}
                  />
                </div>
              </div>
              <div className="ct-settings-field">
                <label className="ct-field-label" htmlFor="two-factor-setup-code">
                  Uygulamadaki kod
                </label>
                <Input
                  id="two-factor-setup-code"
                  className="ct-code-input"
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, ""))}
                  onPressEnter={() => {
                    if (/^\d{6}$/.test(setupCode)) {
                      void handleSetupFinish();
                    }
                  }}
                />
              </div>
            </>
          ) : (
            <div className="ct-settings-field">
              <label className="ct-field-label" htmlFor="two-factor-setup-password">
                Şifren
              </label>
              <Input.Password
                id="two-factor-setup-password"
                prefix={<LockOutlined />}
                autoComplete="current-password"
                autoFocus
                value={setupPassword}
                onChange={(event) => setSetupPassword(event.target.value)}
                onPressEnter={() => {
                  if (setupPassword.length >= 8) {
                    void handleSetupStart();
                  }
                }}
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        rootClassName={confirmAction === "disable" ? "ct-modal danger" : "ct-modal"}
        open={confirmAction !== null}
        destroyOnHidden
        title={
          <ModalHeading
            tone={confirmAction === "disable" ? "danger" : undefined}
            icon={confirmAction === "disable" ? <StopOutlined /> : <KeyOutlined />}
            title={
              confirmAction === "disable"
                ? "İki Adımlı Doğrulamayı Kapat"
                : "Yeni Kurtarma Kodları"
            }
            description="Şifreni ve doğrulama uygulamandaki kodu (ya da bir kurtarma kodunu) gir."
          />
        }
        okText={confirmAction === "disable" ? "Kapat" : "Oluştur"}
        cancelText="Vazgeç"
        confirmLoading={busy}
        okButtonProps={{
          danger: confirmAction === "disable",
          disabled: confirmPassword.length < 8 || confirmCode.trim().length < 6,
        }}
        onCancel={closeConfirm}
        onOk={() => {
          void handleConfirm();
        }}
      >
        <div className="ct-modal-form">
          <div className="ct-settings-field">
            <label className="ct-field-label" htmlFor="two-factor-confirm-password">
              Şifren
            </label>
            <Input.Password
              id="two-factor-confirm-password"
              prefix={<LockOutlined />}
              autoComplete="current-password"
              autoFocus
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <div className="ct-settings-field">
            <label className="ct-field-label" htmlFor="two-factor-confirm-code">
              Kod
            </label>
            <Input
              id="two-factor-confirm-code"
              className="ct-code-input"
              placeholder="000000"
              maxLength={9}
              autoComplete="one-time-code"
              value={confirmCode}
              onChange={(event) => setConfirmCode(event.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        rootClassName="ct-modal"
        open={recoveryCodes !== null}
        closable={false}
        mask={{ closable: false }}
        keyboard={false}
        title={
          <ModalHeading
            icon={<KeyOutlined />}
            title="Kurtarma Kodların"
            description="Telefonuna ulaşamazsan bunlarla giriş yaparsın. Her biri bir kez çalışır ve bir daha gösterilmez: güvenli bir yere kaydet."
          />
        }
        okText="Kaydettim"
        cancelButtonProps={{ style: { display: "none" } }}
        okButtonProps={{ disabled: !codesSaved }}
        onOk={() => setRecoveryCodes(null)}
      >
        <div className="ct-modal-form">
          <ol className="ct-two-factor-codes">
            {recoveryCodes?.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ol>
          <Button
            icon={<CopyOutlined />}
            onClick={() => {
              void copyText((recoveryCodes ?? []).join("\n"), "Kodlar kopyalandı.");
            }}
          >
            Hepsini kopyala
          </Button>
          <Checkbox checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)}>
            Kodları güvenli bir yere kaydettim
          </Checkbox>
        </div>
      </Modal>
    </>
  );
}
