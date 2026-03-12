import type { AuthSessionEnvelope, CompanyUserRole } from "@fence-estimator/contracts";

export const SESSION_STORAGE_KEY = "fence-estimator.auth-session";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUserRole(value: unknown): value is CompanyUserRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

function sanitizeStoredSession(value: unknown): AuthSessionEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const sessionEnvelope = value as Record<string, unknown>;
  const company = sessionEnvelope.company;
  const user = sessionEnvelope.user;
  const session = sessionEnvelope.session;

  if (!company || typeof company !== "object" || !user || typeof user !== "object" || !session || typeof session !== "object") {
    return null;
  }

  const companyRecord = company as Record<string, unknown>;
  const userRecord = user as Record<string, unknown>;
  const sessionRecord = session as Record<string, unknown>;

  if (
    !isString(companyRecord.id) ||
    !isString(companyRecord.name) ||
    !isString(companyRecord.createdAtIso) ||
    !isString(userRecord.id) ||
    !isString(userRecord.companyId) ||
    !isString(userRecord.email) ||
    !isString(userRecord.displayName) ||
    !isUserRole(userRecord.role) ||
    !isString(userRecord.createdAtIso) ||
    !isString(sessionRecord.id) ||
    !isString(sessionRecord.companyId) ||
    !isString(sessionRecord.userId) ||
    !isString(sessionRecord.createdAtIso) ||
    !isString(sessionRecord.expiresAtIso)
  ) {
    return null;
  }

  const revokedAtIso =
    sessionRecord.revokedAtIso === null || sessionRecord.revokedAtIso === undefined
      ? null
      : typeof sessionRecord.revokedAtIso === "string"
        ? sessionRecord.revokedAtIso
        : null;

  return {
    company: {
      id: companyRecord.id,
      name: companyRecord.name,
      createdAtIso: companyRecord.createdAtIso
    },
    user: {
      id: userRecord.id,
      companyId: userRecord.companyId,
      email: userRecord.email,
      displayName: userRecord.displayName,
      role: userRecord.role,
      createdAtIso: userRecord.createdAtIso
    },
    session: {
      id: sessionRecord.id,
      companyId: sessionRecord.companyId,
      userId: sessionRecord.userId,
      createdAtIso: sessionRecord.createdAtIso,
      expiresAtIso: sessionRecord.expiresAtIso,
      revokedAtIso
    }
  };
}

function clearLegacyStorage(storage: Storage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function readStoredSession(): AuthSessionEnvelope | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const sessionRaw = storage.getItem(SESSION_STORAGE_KEY);
  const legacyRaw = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null;
  const raw = sessionRaw ?? legacyRaw;
  if (!raw) {
    return null;
  }

  try {
    const sanitized = sanitizeStoredSession(JSON.parse(raw));
    if (!sanitized) {
      clearLegacyStorage(storage);
      return null;
    }

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sanitized));
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return sanitized;
  } catch {
    clearLegacyStorage(storage);
    return null;
  }
}

export function writeStoredSession(session: AuthSessionEnvelope | null): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (!session) {
    clearLegacyStorage(storage);
    return;
  }

  const sanitized = sanitizeStoredSession(session);
  if (!sanitized) {
    clearLegacyStorage(storage);
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sanitized));
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
