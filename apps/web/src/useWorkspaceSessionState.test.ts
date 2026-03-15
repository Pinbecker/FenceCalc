import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

const sampleSession: AuthSessionEnvelope = {
  company: {
    id: "company-1",
    name: "Acme Fencing",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  session: {
    id: "session-1",
    companyId: "company-1",
    userId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    expiresAtIso: "2026-04-10T10:00:00.000Z"
  }
};

const sampleDrawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front boundary",
    customerName: "Cleveland Land Services",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 4,
    gateCount: 1,
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
    versionNumber: 2,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    createdByDisplayName: "Owner",
    updatedByUserId: "user-1",
    updatedByDisplayName: "Owner",
    contributorUserIds: ["user-1"],
    contributorDisplayNames: ["Owner"],
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T11:00:00.000Z"
  }
];

async function loadUseWorkspaceSessionState(options?: {
  stateValues?: unknown[];
  apiOverrides?: Record<string, unknown>;
  errorOverrides?: Record<string, unknown>;
  sessionStoreOverrides?: Record<string, unknown>;
}) {
  vi.resetModules();

  const stateValues = options?.stateValues ?? [];
  const stateSetters = {
    session: vi.fn(),
    drawings: vi.fn(),
    isRestoringSession: vi.fn(),
    isAuthenticating: vi.fn(),
    isLoadingDrawings: vi.fn()
  };
  const setterOrder = [
    stateSetters.session,
    stateSetters.drawings,
    stateSetters.isRestoringSession,
    stateSetters.isAuthenticating,
    stateSetters.isLoadingDrawings
  ];
  let stateIndex = 0;
  const requestRef = { current: 0 };

  const apiClient = {
    getAuthenticatedUser: vi.fn(() => Promise.resolve(sampleSession)),
    listDrawings: vi.fn(() => Promise.resolve(sampleDrawings)),
    login: vi.fn(() => Promise.resolve(sampleSession)),
    logout: vi.fn(() => Promise.resolve()),
    registerAccount: vi.fn(() => Promise.resolve(sampleSession)),
    ...options?.apiOverrides
  };
  const apiErrors = {
    extractApiErrorMessage: vi.fn(() => "Problem"),
    ...options?.errorOverrides
  };
  const sessionStore = {
    readStoredSession: vi.fn(() => sampleSession),
    writeStoredSession: vi.fn(),
    ...options?.sessionStoreOverrides
  };

  vi.doMock("react", () => ({
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useRef: () => requestRef,
    useState: (initialValue: unknown) => {
      const value =
        stateIndex < stateValues.length
          ? stateValues[stateIndex]
          : typeof initialValue === "function"
            ? (initialValue as () => unknown)()
            : initialValue;
      const setter = setterOrder[stateIndex] ?? vi.fn();
      stateIndex += 1;
      return [value, setter];
    }
  }));
  vi.doMock("./apiClient", () => apiClient);
  vi.doMock("./apiErrors", () => apiErrors);
  vi.doMock("./sessionEnvelopeStore", () => sessionStore);

  const module = await import("./useWorkspaceSessionState.js");
  return {
    ...module,
    apiClient,
    apiErrors,
    sessionStore,
    stateSetters
  };
}

describe("useWorkspaceSessionState", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
  });

  it("restores the stored session and loads authenticated drawings on startup", async () => {
    const { useWorkspaceSessionState, apiClient, sessionStore, stateSetters } = await loadUseWorkspaceSessionState({
      stateValues: [null, [], true, false, false]
    });
    const clearMessages = vi.fn();
    const setErrorMessage = vi.fn();
    const setNoticeMessage = vi.fn();

    useWorkspaceSessionState({
      clearMessages,
      setErrorMessage,
      setNoticeMessage
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(sessionStore.readStoredSession).toHaveBeenCalled();
    expect(apiClient.getAuthenticatedUser).toHaveBeenCalled();
    expect(apiClient.listDrawings).toHaveBeenCalled();
    expect(stateSetters.session).toHaveBeenCalledWith(sampleSession);
    expect(stateSetters.drawings).toHaveBeenCalledWith([]);
    expect(stateSetters.drawings).toHaveBeenCalledWith(sampleDrawings);
    expect(sessionStore.writeStoredSession).toHaveBeenCalledWith(sampleSession);
    expect(stateSetters.isRestoringSession).toHaveBeenCalledWith(false);
    expect(setErrorMessage).not.toHaveBeenCalled();
    expect(setNoticeMessage).not.toHaveBeenCalled();
  });

  it("refreshes drawings and drives register, login, and logout flows", async () => {
    const { useWorkspaceSessionState, apiClient, sessionStore, stateSetters } = await loadUseWorkspaceSessionState({
      stateValues: [sampleSession, sampleDrawings, true, false, false]
    });
    const clearMessages = vi.fn();
    const setErrorMessage = vi.fn();
    const setNoticeMessage = vi.fn();

    const state = useWorkspaceSessionState({
      clearMessages,
      setErrorMessage,
      setNoticeMessage
    });

    await state.refreshDrawings();
    await state.register(
      { companyName: "Acme Fencing", displayName: "Owner", email: "owner@example.com", password: "Secret123!" },
      vi.fn()
    );
    await state.login({ email: "owner@example.com", password: "Secret123!" });
    state.logout(vi.fn());

    await Promise.resolve();
    await Promise.resolve();

    expect(apiClient.listDrawings).toHaveBeenCalled();
    expect(apiClient.registerAccount).toHaveBeenCalled();
    expect(apiClient.login).toHaveBeenCalledWith({ email: "owner@example.com", password: "Secret123!" });
    expect(apiClient.logout).toHaveBeenCalled();
    expect(clearMessages).toHaveBeenCalled();
    expect(stateSetters.isLoadingDrawings).toHaveBeenCalledWith(true);
    expect(stateSetters.isLoadingDrawings).toHaveBeenCalledWith(false);
    expect(stateSetters.isAuthenticating).toHaveBeenCalledWith(true);
    expect(stateSetters.isAuthenticating).toHaveBeenCalledWith(false);
    expect(sessionStore.writeStoredSession).toHaveBeenCalledWith(sampleSession);
    expect(sessionStore.writeStoredSession).toHaveBeenCalledWith(null);
    expect(setNoticeMessage).toHaveBeenCalledWith("Signed in as Owner");
    expect(setNoticeMessage).toHaveBeenCalledWith("Welcome back, Owner");
    expect(setErrorMessage).not.toHaveBeenCalled();
  });

  it("clears session state when authentication restoration fails", async () => {
    const authError = new Error("no session");
    const { useWorkspaceSessionState, apiErrors, sessionStore, stateSetters } = await loadUseWorkspaceSessionState({
      stateValues: [null, [], true, false, false],
      apiOverrides: {
        getAuthenticatedUser: vi.fn(() => {
          throw authError;
        })
      }
    });
    const setErrorMessage = vi.fn();

    useWorkspaceSessionState({
      clearMessages: vi.fn(),
      setErrorMessage,
      setNoticeMessage: vi.fn()
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(sessionStore.writeStoredSession).toHaveBeenCalledWith(null);
    expect(stateSetters.session).toHaveBeenCalledWith(sampleSession);
    expect(stateSetters.session).toHaveBeenCalledWith(null);
    expect(stateSetters.drawings).toHaveBeenCalledWith([]);
    expect(stateSetters.isRestoringSession).toHaveBeenCalledWith(false);
    expect(apiErrors.extractApiErrorMessage).not.toHaveBeenCalled();
    expect(setErrorMessage).not.toHaveBeenCalled();
  });
});
