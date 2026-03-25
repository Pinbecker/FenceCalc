import * as Sentry from "@sentry/react";
import type { AuthSessionEnvelope } from "@fence-estimator/contracts";

const sentryDsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() ?? "";
const sentryEnvironment = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim() || import.meta.env.MODE;
const sentryRelease = (import.meta.env.VITE_SENTRY_RELEASE as string | undefined)?.trim() || undefined;
const sentryTracesSampleRateRaw = (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined)?.trim() ?? "0";
const sentryTracesSampleRate = Number.parseFloat(sentryTracesSampleRateRaw);

function sentryEnabled(): boolean {
  return sentryDsn.length > 0;
}

export function initClientObservability(): void {
  if (sentryEnabled()) {
    Sentry.init({
      dsn: sentryDsn,
      environment: sentryEnvironment,
      release: sentryRelease,
      tracesSampleRate: Number.isFinite(sentryTracesSampleRate) ? sentryTracesSampleRate : 0,
      sendDefaultPii: false
    });
  }

  installGlobalErrorHandlers();
}

export function setClientTelemetrySession(session: AuthSessionEnvelope | null): void {
  if (!sentryEnabled()) {
    return;
  }

  if (!session) {
    Sentry.setUser(null);
    Sentry.setTag("company_id", "");
    return;
  }

  Sentry.setUser({
    id: session.user.id
  });
  Sentry.setTag("company_id", session.company.id);
  Sentry.setTag("user_role", session.user.role);
}

export function reportClientError(error: unknown, context: string, details?: Record<string, unknown>): void {
  console.error("Client error", {
    context,
    details,
    error
  });

  if (sentryEnabled()) {
    Sentry.withScope((scope) => {
      scope.setTag("context", context);
      if (details) {
        scope.setContext("details", details);
      }
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(`${context}: ${String(error)}`, "error");
      }
    });
  }
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? event.message, "window.error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, "window.unhandledrejection");
  });
}