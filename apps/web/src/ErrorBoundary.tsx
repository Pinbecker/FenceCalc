import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportClientError } from "./errorReporting";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportClientError(error, "react.error-boundary", {
      componentStack: errorInfo.componentStack
    });
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="portal-loading-screen" role="alert" aria-live="assertive">
          <div className="portal-loading-card">
            <strong>Something went wrong</strong>
            <p>The page hit an unexpected error. Reload to recover.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}