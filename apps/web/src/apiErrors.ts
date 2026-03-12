import { ApiClientError } from "./apiClient";

interface VersionConflictDetails {
  currentVersionNumber?: unknown;
}

export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected request failure";
}

export function extractCurrentVersionNumber(error: unknown): number | null {
  if (!(error instanceof ApiClientError) || error.status !== 409) {
    return null;
  }
  const details = error.details as VersionConflictDetails | null;
  return typeof details?.currentVersionNumber === "number" ? details.currentVersionNumber : null;
}
