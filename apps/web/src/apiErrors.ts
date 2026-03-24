import { ApiClientError } from "./apiClient";

interface VersionConflictDetails {
  currentVersionNumber?: unknown;
}

interface FlattenedValidationDetails {
  formErrors?: unknown;
  fieldErrors?: unknown;
}

function formatValidationDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const { formErrors, fieldErrors } = details as FlattenedValidationDetails;
  const segments: string[] = [];

  if (Array.isArray(formErrors)) {
    for (const entry of formErrors) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        segments.push(entry.trim());
      }
    }
  }

  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [fieldName, messages] of Object.entries(fieldErrors)) {
      if (!Array.isArray(messages)) {
        continue;
      }
      for (const message of messages) {
        if (typeof message === "string" && message.trim().length > 0) {
          segments.push(`${fieldName}: ${message.trim()}`);
        }
      }
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join("; ");
}

export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const validationDetails = formatValidationDetails(error.details);
    if (!validationDetails) {
      return error.message;
    }
    return `${error.message}: ${validationDetails}`;
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
