import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, X, Wifi, RefreshCw } from "lucide-react";
import { LoginPage, RegisterPage, useAuthController } from "./features/auth";
import WorkspaceShell from "./components/WorkspaceShell";
import logo from "./assets/logo.png";
import type { AppUpdateSnapshot, AppUpdateEvent } from "../../shared/update-contracts";

function App() {
  const {
    activePage,
    statusMessage,
    statusTone,
    appVersion,
    isBooting,
    isOffline,
    retryConnection,
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
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(null);

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

          <div className="ct-app-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {updateState && updateState.phase === "downloaded" && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span className="ct-meta-pill" style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  color: "#4ade80",
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  fontWeight: 500
                }}>
                  v{updateState.nextVersion || "Yeni"} Sürüm Hazır
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void window.desktopApi.installDownloadedUpdate();
                  }}
                  style={{
                    background: "#22c55e",
                    color: "#ffffff",
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    height: "22px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(34, 197, 94, 0.2)"
                  }}
                >
                  Güncelle
                </button>
              </div>
            )}
            {updateState && updateState.phase === "downloading" && (
              <span className="ct-meta-pill" style={{
                background: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                color: "#60a5fa",
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontWeight: 500
              }}>
                Güncelleme İndiriliyor{typeof updateState.progressPercent === "number" ? ` (%${updateState.progressPercent})` : ""}
              </span>
            )}
            {updateState && updateState.phase === "available" && (
              <span className="ct-meta-pill" style={{
                background: "rgba(234, 179, 8, 0.15)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                color: "#facc15",
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontWeight: 500
              }}>
                Yeni Sürüm Bulundu...
              </span>
            )}
            <span className="ct-meta-pill">Sürüm: v{appVersion}</span>
          </div>
        </header>

        <section className={mainWrapClassName}>
          {isOffline ? (
            <section
              className="ct-auth-card flex flex-col items-center justify-center text-center p-8"
              style={{
                minHeight: "360px",
                background: "rgba(10, 10, 10, 0.45)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "18px",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center"
              }}
            >
              <div className="relative mb-6 flex items-center justify-center" style={{ position: "relative", marginBottom: "24px" }}>
                <div
                  className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl animate-pulse"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "9999px",
                    background: "rgba(59, 130, 246, 0.1)",
                    filter: "blur(24px)",
                    width: "80px",
                    height: "80px"
                  }}
                />
                <div
                  className="relative flex h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    position: "relative",
                    display: "flex",
                    height: "64px",
                    width: "64px",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "9999px",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    background: "rgba(30, 58, 138, 0.2)",
                    color: "#60a5fa"
                  }}
                >
                  <Wifi size={32} className="animate-pulse" />
                </div>
                <span className="absolute right-0 top-0 flex h-3.5 w-3.5" style={{ position: "absolute", right: 0, top: 0, display: "flex", height: "14px", width: "14px" }}>
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{
                      position: "absolute",
                      display: "inline-flex",
                      height: "100%",
                      width: "100%",
                      borderRadius: "9999px",
                      background: "#60a5fa",
                      opacity: 0.75
                    }}
                  />
                  <span
                    className="relative inline-flex h-3.5 w-3.5 rounded-full"
                    style={{
                      position: "relative",
                      display: "inline-flex",
                      height: "14px",
                      width: "14px",
                      borderRadius: "9999px",
                      background: "#3b82f6"
                    }}
                  />
                </span>
              </div>

              <h2 className="text-xl font-bold text-white mb-2" style={{ letterSpacing: "-0.01em", color: "#ffffff", fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
                Ağ Bağlantısı Bekleniyor
              </h2>
              <p className="text-sm text-slate-400 mb-6" style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "290px", lineHeight: "1.6", marginBottom: "24px" }}>
                Connect sunucularına bağlantı kurulamadı. Lütfen internet bağlantınızı kontrol edin. Otomatik olarak yeniden bağlanmayı deniyoruz...
              </p>

              <button
                type="button"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-white font-medium text-sm transition-all duration-200"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 500,
                  background: "rgba(255, 255, 255, 0.03)",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onClick={retryConnection}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <RefreshCw size={14} className="animate-spin" style={{ animationDuration: "3s" }} /> Tekrar Dene
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
              <section className="ct-auth-card ct-double-bezel-inner" style={{ border: "none" }}>
                <div className="flex justify-center pt-4 pb-6">
                  <img 
                    src={logo} 
                    alt="Connect Logo" 
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
