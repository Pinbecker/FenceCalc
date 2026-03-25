import * as Sentry from "@sentry/node";
import type { FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";

let sentryEnabled = false;

export function initApiSentry(config: AppConfig): void {
  if (!config.sentryDsn) {
    sentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment ?? config.nodeEnv,
    release: config.sentryRelease ?? undefined,
    tracesSampleRate: config.sentryTracesSampleRate,
    sendDefaultPii: false
  });
  sentryEnabled = true;
}

export function captureApiException(error: unknown, request: FastifyRequest): void {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("request_id", request.id);
    scope.setTag("method", request.method);
    scope.setTag("route", request.routeOptions.url);
    scope.setContext("request", {
      method: request.method,
      route: request.routeOptions.url,
      requestId: request.id
    });
    Sentry.captureException(error);
  });
}

export function captureApiProcessException(error: unknown, context: string): void {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("context", context);
    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureMessage(`${context}: ${String(error)}`, "error");
  });
}

export async function flushApiSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryEnabled) {
    return;
  }

  await Sentry.flush(timeoutMs);
}