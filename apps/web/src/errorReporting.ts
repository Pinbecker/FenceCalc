export function reportClientError(error: unknown, context: string, details?: Record<string, unknown>): void {
  console.error("Client error", {
    context,
    details,
    error
  });
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