import React from "react";
import { Avatar, Button } from "antd";
import { PhoneOutlined, CloseOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { getDisplayInitials } from "../../../workspace-utils";

interface CallOverlayProps {
  callState: CallSessionState;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}

export function CallOverlay({
  callState,
  onAccept,
  onReject,
  onCancel,
}: CallOverlayProps) {
  const { status, peerUser, callerName, isMuted } = callState;

  if (status === "idle" || status === "active" || (status === "incoming" && isMuted)) {
    return null;
  }

  const displayName = peerUser?.displayName || callerName || "Bilinmeyen Kullanıcı";
  const initials = getDisplayInitials(displayName);
  const isIncoming = status === "incoming";

  const avatarAnimation = isIncoming
    ? "callAvatarBreathe 4s infinite ease-in-out"
    : "callAvatarDimPulse 3s infinite ease-in-out";

  return (
    <div style={styles.overlayContainer}>
      {/* Dynamic Keyframe Injection */}
      <style>{`
        @keyframes callPulseRing {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        @keyframes callAvatarBreathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 40px rgba(99, 102, 241, 0.8);
          }
        }
        @keyframes callAvatarDimPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.65;
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
          }
          50% {
            transform: scale(1.02);
            opacity: 0.95;
            box-shadow: 0 0 25px rgba(255, 255, 255, 0.25);
          }
        }
        @keyframes buttonBreathe {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      `}</style>

      <div style={styles.cardContainer}>
        {/* Animated Background Pulse Waves */}
        <div style={styles.wavesContainer}>
          <div style={{ ...styles.wave, animation: "callPulseRing 3s infinite linear" }} />
          <div style={{ ...styles.wave, animation: "callPulseRing 3s infinite linear 1s" }} />
          <div style={{ ...styles.wave, animation: "callPulseRing 3s infinite linear 2s" }} />
        </div>

        {/* User Info Block */}
        <div style={styles.avatarWrapper}>
          {peerUser?.avatarUrl ? (
            <img
              src={peerUser.avatarUrl}
              alt={displayName}
              style={{ ...styles.avatarImage, animation: avatarAnimation }}
            />
          ) : (
            <div style={{ ...styles.fallbackAvatar, animation: avatarAnimation }}>
              <span style={styles.fallbackText}>{initials}</span>
            </div>
          )}
        </div>

        <h2 style={styles.displayNameText}>{displayName}</h2>
        <p style={styles.statusText}>
          {isIncoming ? "Gelen Sesli Arama..." : "Aranıyor..."}
        </p>

        {/* Call Action Controls */}
        <div style={styles.actionsContainer}>
          {isIncoming ? (
            <>
              {/* Accept Call Button */}
              <button
                onClick={onAccept}
                style={{ ...styles.circleBtn, ...styles.acceptBtn, animation: "buttonBreathe 2s infinite ease-in-out" }}
                title="Kabul Et"
              >
                <PhoneOutlined style={styles.btnIcon} />
              </button>

              {/* Reject Call Button */}
              <button
                onClick={onReject}
                style={{ ...styles.circleBtn, ...styles.rejectBtn }}
                title="Reddet"
              >
                <CloseOutlined style={styles.btnIcon} />
              </button>
            </>
          ) : (
            /* Cancel Outgoing Call Button */
            <button
              onClick={onCancel}
              style={{ ...styles.circleBtn, ...styles.rejectBtn }}
              title="İptal Et"
            >
              <CloseOutlined style={styles.btnIcon} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlayContainer: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    backgroundColor: "rgba(9, 9, 11, 0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContainer: {
    position: "relative",
    width: "420px",
    padding: "48px 24px",
    borderRadius: "24px",
    backgroundColor: "rgba(24, 24, 27, 0.65)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    overflow: "hidden",
  },
  wavesContainer: {
    position: "absolute",
    top: "30%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "250px",
    height: "250px",
    pointerEvents: "none",
    zIndex: 0,
  },
  wave: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    border: "2px solid rgba(99, 102, 241, 0.25)",
    opacity: 0,
  },
  avatarWrapper: {
    position: "relative",
    zIndex: 10,
    marginBottom: "32px",
  },
  avatarImage: {
    width: "128px",
    height: "128px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid rgba(255, 255, 255, 0.1)",
  },
  fallbackAvatar: {
    width: "128px",
    height: "128px",
    borderRadius: "50%",
    backgroundColor: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    backgroundImage: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "3px solid rgba(255, 255, 255, 0.1)",
  },
  fallbackText: {
    fontSize: "42px",
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "1px",
    textShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
  },
  displayNameText: {
    position: "relative",
    zIndex: 10,
    fontSize: "26px",
    fontWeight: 700,
    color: "#ffffff",
    margin: "0 0 8px 0",
    letterSpacing: "-0.5px",
  },
  statusText: {
    position: "relative",
    zIndex: 10,
    fontSize: "15px",
    fontWeight: 500,
    color: "rgba(161, 161, 170, 0.8)",
    margin: "0 0 40px 0",
    letterSpacing: "0.5px",
  },
  actionsContainer: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    gap: "32px",
    justifyContent: "center",
    alignItems: "center",
  },
  circleBtn: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    border: "none",
    outline: "none",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
  },
  acceptBtn: {
    backgroundColor: "#22c55e",
    color: "#ffffff",
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
    color: "#ffffff",
  },
  btnIcon: {
    fontSize: "24px",
  },
};
