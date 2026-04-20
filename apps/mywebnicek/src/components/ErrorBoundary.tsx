import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component to catch React rendering errors
 * and prevent the entire app from crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 500,
              padding: 20,
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span style={{ color: "#d13438", fontSize: 32 }}>⚠</span>
              <h3 style={{ margin: 0 }}>Something went wrong</h3>
            </div>
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <span style={{ color: "#605e5c" }}>
                {this.state.error?.message || "An unexpected error occurred"}
              </span>
              {this.state.error?.message?.includes("tag name") && (
                <p style={{ marginTop: 8, color: "#605e5c" }}>
                  Tip: Tag names should be valid HTML tags like "div", "span",
                  "input" (without angle brackets).
                </p>
              )}
            </div>
            <button
              type="button"
              style={{
                padding: "8px 16px",
                background: "#0078d4",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={this.handleReset}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
