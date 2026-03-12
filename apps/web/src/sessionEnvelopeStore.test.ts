import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readStoredSession,
  SESSION_STORAGE_KEY,
  writeStoredSession
} from "./sessionEnvelopeStore.js";

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

describe("sessionEnvelopeStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates legacy localStorage sessions into sanitized session storage", () => {
    const sessionStorage = createStorageMock();
    const localStorage = createStorageMock();
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        company: { id: "company-1", name: "Acme", createdAtIso: "2026-03-10T10:00:00.000Z" },
        user: {
          id: "user-1",
          companyId: "company-1",
          email: "jane@example.com",
          displayName: "Jane",
          role: "OWNER",
          createdAtIso: "2026-03-10T10:00:00.000Z"
        },
        session: {
          id: "session-1",
          companyId: "company-1",
          userId: "user-1",
          createdAtIso: "2026-03-10T10:00:00.000Z",
          expiresAtIso: "2026-04-10T10:00:00.000Z",
          revokedAtIso: null,
          token: "legacy-bearer-token"
        }
      }),
    );

    vi.stubGlobal("window", { sessionStorage, localStorage });

    const session = readStoredSession();

    expect(session?.session.id).toBe("session-1");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toContain("legacy-bearer-token");
  });

  it("clears invalid stored sessions", () => {
    const sessionStorage = createStorageMock();
    const localStorage = createStorageMock();
    sessionStorage.setItem(SESSION_STORAGE_KEY, "{not-json");
    localStorage.setItem(SESSION_STORAGE_KEY, "{not-json");

    vi.stubGlobal("window", { sessionStorage, localStorage });

    expect(readStoredSession()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("writes sanitized sessions and clears on null", () => {
    const sessionStorage = createStorageMock();
    const localStorage = createStorageMock();
    localStorage.setItem(SESSION_STORAGE_KEY, "stale");
    vi.stubGlobal("window", { sessionStorage, localStorage });

    writeStoredSession({
      company: { id: "company-1", name: "Acme", createdAtIso: "2026-03-10T10:00:00.000Z" },
      user: {
        id: "user-1",
        companyId: "company-1",
        email: "jane@example.com",
        displayName: "Jane",
        role: "ADMIN",
        createdAtIso: "2026-03-10T10:00:00.000Z"
      },
      session: {
        id: "session-1",
        companyId: "company-1",
        userId: "user-1",
        createdAtIso: "2026-03-10T10:00:00.000Z",
        expiresAtIso: "2026-04-10T10:00:00.000Z",
        revokedAtIso: null
      }
    });

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toContain("\"session-1\"");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    writeStoredSession(null);

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
