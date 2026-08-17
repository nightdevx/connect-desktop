import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

// The renderer had no error boundary at all: any render-time throw anywhere in
// the tree unmounted the whole app and left a blank black window with no text,
// no reload affordance and nothing in the UI to report. The user's only option
// was to kill the process from the tray.
//
// React only routes errors thrown during render, in lifecycle methods and in
// constructors here — not ones from event handlers, timers or rejected
// promises. Those are caught by the window-level listeners below, which turn
// them into a visible status instead of a silent console line.
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = { error: null, componentStack: null };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, componentStack: null };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    // Sentry's renderer integration picks console.error up; keep the component
    // stack in the message so a report is actionable without a source map.
    console.error("[renderer] unhandled render error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleDismiss = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  public render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          // Deliberately inline. This screen renders when the React tree has
          // already failed, so it must not depend on any of the app's own
          // classes still being reachable.
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "32px",
          background: "var(--ct-surface-0, #050505)",
          color: "var(--ct-text-primary, #f5f5f5)",
          fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
          // The frameless window has no OS title bar, so leave room for the
          // custom drag region rather than covering it.
          paddingTop: "64px",
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
          Uygulamada beklenmeyen bir hata oluştu
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "560px",
            textAlign: "center",
            color: "var(--ct-text-muted, rgba(255,255,255,0.6))",
            fontSize: "13px",
          }}
        >
          Arayüz çizilemedi. Yeniden yüklemek genellikle sorunu çözer; tekrar
          ederse aşağıdaki ayrıntıyı bildirin.
        </p>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: "var(--ct-accent, #ffffff)",
              color: "var(--ct-text-inverse, #050505)",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Yeniden Yükle
          </button>
          <button
            type="button"
            onClick={this.handleDismiss}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "1px solid var(--ct-border, rgba(255,255,255,0.12))",
              background: "transparent",
              color: "var(--ct-text-primary, #f5f5f5)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Yine de Devam Et
          </button>
        </div>

        <details
          style={{
            width: "100%",
            maxWidth: "720px",
            marginTop: "8px",
            color: "var(--ct-text-muted, rgba(255,255,255,0.45))",
            fontSize: "11px",
          }}
        >
          <summary style={{ cursor: "pointer" }}>Teknik ayrıntı</summary>
          <pre
            style={{
              marginTop: "8px",
              padding: "12px",
              maxHeight: "240px",
              overflow: "auto",
              borderRadius: "10px",
              background: "var(--ct-alpha-02, rgba(255,255,255,0.03))",
              border: "1px solid var(--ct-border, rgba(255,255,255,0.06))",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
            {componentStack ? `\n\nComponent stack:${componentStack}` : ""}
          </pre>
        </details>
      </div>
    );
  }
}
