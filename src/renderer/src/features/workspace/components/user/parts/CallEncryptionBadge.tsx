import { Tooltip } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useCallEncryptionStore } from "@/features/livekit";

/**
 * The lock on a 1:1 call: "Şifreli" once both sides hold the key, with the
 * safety code in the tooltip. Two people who read the same nine digits to each
 * other know nobody, the server included, sits between them.
 */
export function CallEncryptionBadge() {
  const encryption = useCallEncryptionStore((state) => state.encryption);
  if (!encryption) {
    return null;
  }

  if (!encryption.encrypted) {
    return (
      <span className="ct-call-encryption pending">
        <LockOutlined /> Şifreleniyor…
      </span>
    );
  }

  return (
    <Tooltip
      title={
        <span className="ct-call-encryption-tip">
          Uçtan uca şifreli: görüşmeyi sunucu dahil kimse dinleyemez.
          <br />
          Güvenlik kodu: <strong>{encryption.safetyCode}</strong>
          <br />
          Karşı taraftaki kodla aynıysa arada kimse yok.
        </span>
      }
    >
      <span className="ct-call-encryption" tabIndex={0}>
        <LockOutlined /> Şifreli
      </span>
    </Tooltip>
  );
}
