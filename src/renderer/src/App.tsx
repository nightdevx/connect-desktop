import { useEffect, useRef, useState } from "react";
import { message } from "antd";
import {
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  MinusOutlined,
  ReloadOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { LoginPage, RegisterPage, useAuthController } from "./features/auth";
import WorkspaceShell from "./components/WorkspaceShell";
import logo from "./assets/logo.png";
import type { AppUpdateSnapshot } from "../../shared/update-contracts";

function App() {
  const {
    activePage,
    appVersion,
    isOffline,
    retryConnection,
    isBooting,
    isLoading,
    isLoggingOut,
    session,
    statusMessage,
    statusTone,
    statusNonce,
    setActivePage,
    login,
    register,
    logout,
  } = useAuthController();

  const isAuthenticated = Boolean(session.authenticated && session.user);
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(null);

  // setStatus() is called from around fifty places -- device removed, mic
  // refresh failed, user blocked -- and nothing in the tree ever rendered the
  // result, so every one of those messages was swallowed. This is the single
  // consumer that surfaces them.
  const [messageApi, messageHolder] = message.useMessage({ top: 60, maxCount: 3 });
  const lastStatusNonce = useRef(statusNonce);

  useEffect(() => {
    // Nonce starts where it was on mount, so the store's initial placeholder
    // ("Giriş gerekli") never pops a toast.
    if (statusNonce === lastStatusNonce.current || !statusMessage) {
      return;
    }
    lastStatusNonce.current = statusNonce;

    void messageApi.open({
      key: "ct-status",
      type:
        statusTone === "ok"
          ? "success"
          : statusTone === "warn"
            ? "warning"
            : "error",
      content: statusMessage,
    });
  }, [statusNonce, statusMessage, statusTone, messageApi]);

  useEffect(() => {
    let active = true;

    void window.desktopApi.getUpdateState().then((result) => {
      if (active && result.ok && result.data?.state) {
        setUpdateState(result.data.state);
      }
    });

    const unsubscribe = window.desktopApi.onUpdateEvent((event) => {
      if (active) {
        setUpdateState(event.state);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    void window.desktopApi.getWindowState().then((result) => {
      if (!active || !result.ok || !result.data) {
        return;
      }

      setWindowIsMaximized(result.data.isMaximized);
    });

    const unsubscribe = window.desktopApi.onWindowStateChanged((state) => {
      if (!active) {
        return;
      }

      setWindowIsMaximized(Boolean(state.isMaximized));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const mainWrapClassName =
    isAuthenticated && !isBooting
      ? "ct-main-wrap ct-main-wrap--workspace"
      : "ct-main-wrap ct-main-wrap--auth";

  const handleMinimize = (): void => {
    void window.desktopApi.minimizeWindow();
  };

  const handleToggleMaximize = (): void => {
    void window.desktopApi.toggleMaximizeWindow().then((result) => {
      if (!result.ok || !result.data) {
        return;
      }

      setWindowIsMaximized(result.data.isMaximized);
    });
  };

  const handleClose = (): void => {
    void window.desktopApi.closeWindow();
  };

  const updatePhase = updateState?.phase;

  return (
    <main className="ct-app-shell">
      {messageHolder}
      <div className="ct-app-content">
        <header className="ct-titlebar">
          <div className="ct-titlebar-brand">
            <img src={logo} alt="" className="ct-titlebar-logo" />
            <span className="ct-titlebar-name">Connect</span>
          </div>

          <div className="ct-titlebar-actions">
            {updatePhase === "downloaded" && (
              <>
                <span className="ct-update-chip ready">
                  v{updateState?.nextVersion || "Yeni"} hazır
                </span>
                <button
                  type="button"
                  className="ct-update-install"
                  onClick={() => {
                    void window.desktopApi.installDownloadedUpdate();
                  }}
                >
                  Güncelle
                </button>
              </>
            )}

            {updatePhase === "downloading" && (
              <span className="ct-update-chip busy">
                İndiriliyor
                {typeof updateState?.progressPercent === "number"
                  ? ` %${updateState.progressPercent}`
                  : ""}
              </span>
            )}

            {updatePhase === "available" && (
              <span className="ct-update-chip found">Yeni sürüm bulundu</span>
            )}

            <span className="ct-titlebar-version">v{appVersion}</span>

            <div className="ct-window-controls" aria-label="Pencere kontrolleri">
              <button
                type="button"
                className="ct-window-control"
                onClick={handleMinimize}
                aria-label="Pencereyi küçült"
              >
                <MinusOutlined />
              </button>

              <button
                type="button"
                className="ct-window-control"
                onClick={handleToggleMaximize}
                aria-label={
                  windowIsMaximized
                    ? "Pencereyi eski boyuta döndür"
                    : "Pencereyi büyüt"
                }
              >
                {windowIsMaximized ? <CompressOutlined /> : <ExpandOutlined />}
              </button>

              <button
                type="button"
                className="ct-window-control danger"
                onClick={handleClose}
                aria-label="Pencereyi kapat"
              >
                <CloseOutlined />
              </button>
            </div>
          </div>
        </header>

        <section className={mainWrapClassName}>
          {/* The session check is a round trip, and until it answers we do not
              know which of the two screens is the right one. Rendering the
              login card while waiting meant a returning user saw it flash and
              be replaced by the workspace on every cold start. The placeholder
              fades in on a delay, so a fast answer shows nothing at all. */}
          {isBooting ? (
            <div className="ct-boot" role="status" aria-label="Oturum kontrol ediliyor">
              <img src={logo} alt="" className="ct-boot-logo" />
              <span className="ct-boot-bar" aria-hidden="true" />
            </div>
          ) : isOffline ? (
            <section className="ct-offline-card">
              <div className="ct-offline-icon">
                <WifiOutlined />
              </div>

              <h2>Ağ Bağlantısı Bekleniyor</h2>
              <p>
                Connect sunucularına bağlantı kurulamadı. Lütfen internet
                bağlantınızı kontrol edin. Otomatik olarak yeniden bağlanmayı
                deniyoruz...
              </p>

              <button
                type="button"
                className="ct-btn-secondary ct-offline-retry"
                onClick={retryConnection}
              >
                <ReloadOutlined spin /> Tekrar Dene
              </button>
            </section>
          ) : isAuthenticated && session.user ? (
            <WorkspaceShell
              currentUserId={session.user.id}
              currentUsername={session.user.username}
              currentUserRole={session.user.role}
              currentUserCreatedAt={session.user.createdAt}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
            />
          ) : (
            <div className="ct-double-bezel-outer w-full max-w-md mx-auto">
              <section className="ct-auth-card ct-double-bezel-inner">
                <div className="flex justify-center pt-4 pb-6">
                  <img
                    src={logo}
                    alt="Connect"
                    className="h-20 w-auto object-contain"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`ct-auth-tab ${activePage === "login" ? "active" : ""}`}
                    onClick={() => setActivePage("login")}
                  >
                    Giriş Yap
                  </button>
                  <button
                    type="button"
                    className={`ct-auth-tab ${activePage === "register" ? "active" : ""}`}
                    onClick={() => setActivePage("register")}
                  >
                    Kayıt Ol
                  </button>
                </div>

                {activePage === "login" ? (
                  <LoginPage
                    loading={isLoading}
                    onSubmit={login}
                    onGoRegister={() => setActivePage("register")}
                  />
                ) : (
                  <RegisterPage
                    loading={isLoading}
                    onSubmit={register}
                    onGoLogin={() => setActivePage("login")}
                  />
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
