import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WorkspaceShell from "./components/WorkspaceShell";
import { useAuthController } from "./hooks/use-auth-controller";

function App() {
  const {
    activePage,
    statusMessage,
    statusTone,
    appVersion,
    isBooting,
    isLoading,
    isLoggingOut,
    session,
    setActivePage,
    login,
    register,
    logout,
  } = useAuthController();

  const statusState =
    statusTone === "ok" ? "ok" : statusTone === "warn" ? "warn" : "error";
  const isAuthenticated = Boolean(session.authenticated && session.user);
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);

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

  const mainWrapClassName = isAuthenticated
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

  return (
    <main className="ct-app-shell">
      <div className="ct-app-content">
        <header className="ct-window-titlebar">
          <div className="flex items-center gap-2">
            <span className="ct-logo-dot" aria-hidden="true" />
            <span className="ct-titlebar-label">Connect</span>
          </div>

          <div className="ct-titlebar-right">
            <span className="ct-titlebar-meta">Topluluk Ses Alanı</span>

            <div
              className="ct-window-controls"
              aria-label="Pencere kontrolleri"
            >
              <button
                type="button"
                className="ct-window-control"
                onClick={handleMinimize}
                aria-label="Pencereyi küçült"
              >
                <Minus size={14} aria-hidden="true" />
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
                {windowIsMaximized ? (
                  <Minimize2 size={14} aria-hidden="true" />
                ) : (
                  <Maximize2 size={14} aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                className="ct-window-control danger"
                onClick={handleClose}
                aria-label="Pencereyi kapat"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <header className="ct-app-header">
          <div className="flex items-center gap-3">
            <div className="ct-app-logo" aria-hidden="true">
              CT
            </div>
            <div>
              <p className="ct-app-kicker">Topluluk Ses Alanı</p>
              <h1 className="ct-app-title">Connect</h1>
            </div>
          </div>

          <div className="ct-app-header-actions">
            <span className="ct-meta-pill">Sürüm: v{appVersion}</span>
            <span className="ct-meta-pill live" data-state={statusState}>
              {isBooting ? "Yükleniyor" : statusMessage}
            </span>
            {isAuthenticated && (
              <button
                type="button"
                className="ct-btn-secondary ct-header-logout-button"
                onClick={logout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}
              </button>
            )}
          </div>
        </header>

        <section className={mainWrapClassName}>
          {isAuthenticated && session.user ? (
            <WorkspaceShell
              currentUserId={session.user.id}
              currentUsername={session.user.username}
              currentUserRole={session.user.role}
              currentUserCreatedAt={session.user.createdAt}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
            />
          ) : (
            <section className="ct-auth-card">
              <div className="ct-orb" aria-hidden="true" />

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
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
