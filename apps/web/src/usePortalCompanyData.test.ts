import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditLogRecord, AuthSessionEnvelope, CompanyUserRecord, DrawingSummary } from "@fence-estimator/contracts";

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
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T11:00:00.000Z"
  }
];

const sampleUsers: CompanyUserRecord[] = [
  {
    id: "user-1",
    companyId: "company-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  }
];

const sampleAuditLog: AuditLogRecord[] = [
  {
    id: "audit-1",
    companyId: "company-1",
    actorUserId: "user-1",
    action: "DRAWING_UPDATED",
    entityType: "DRAWING",
    entityId: "drawing-1",
    summary: "Updated drawing",
    createdAtIso: "2026-03-10T11:00:00.000Z"
  }
];

function findLastFunctionCall(mock: ReturnType<typeof vi.fn>) {
  const call = [...mock.mock.calls].reverse().find(([value]) => typeof value === "function");
  return call?.[0] as ((current: unknown) => unknown) | undefined;
}

async function loadUsePortalCompanyData(options?: {
  stateValues?: unknown[];
  apiOverrides?: Record<string, unknown>;
  errorOverrides?: Record<string, unknown>;
  portalOverrides?: Record<string, unknown>;
}) {
  vi.resetModules();

  const stateValues = options?.stateValues ?? [];
  const stateSetters = {
    drawings: vi.fn(),
    users: vi.fn(),
    auditLog: vi.fn(),
    isLoadingDrawings: vi.fn(),
    isLoadingUsers: vi.fn(),
    isLoadingAuditLog: vi.fn(),
    isSavingUser: vi.fn(),
    isResettingUserId: vi.fn()
  };
  const setterOrder = [
    stateSetters.drawings,
    stateSetters.users,
    stateSetters.auditLog,
    stateSetters.isLoadingDrawings,
    stateSetters.isLoadingUsers,
    stateSetters.isLoadingAuditLog,
    stateSetters.isSavingUser,
    stateSetters.isResettingUserId
  ];
  let stateIndex = 0;

  const apiClient = {
    createUser: vi.fn(async () => ({
      id: "user-2",
      companyId: "company-1",
      email: "admin@example.com",
      displayName: "Admin",
      role: "ADMIN",
      createdAtIso: "2026-03-10T12:00:00.000Z"
    })),
    listAuditLog: vi.fn(async () => sampleAuditLog),
    listDrawingVersions: vi.fn(async () => [{ id: "version-1", drawingId: "drawing-1", versionNumber: 1 }]),
    listDrawings: vi.fn(async () => sampleDrawings),
    listUsers: vi.fn(async () => sampleUsers),
    restoreDrawingVersion: vi.fn(async () => ({
      id: "drawing-1",
      name: "Restored boundary",
      versionNumber: 3
    })),
    setDrawingArchivedState: vi.fn(async () => ({
      id: "drawing-1",
      name: "Archived boundary",
      versionNumber: 3
    })),
    setUserPassword: vi.fn(async () => undefined),
    ...options?.apiOverrides
  };
  const apiErrors = {
    extractApiErrorMessage: vi.fn(() => "Problem"),
    extractCurrentVersionNumber: vi.fn(() => null),
    ...options?.errorOverrides
  };
  const portalSessionData = {
    EMPTY_PORTAL_COMPANY_DATA: {
      drawings: [],
      users: [],
      auditLog: []
    },
    loadPortalCompanyData: vi.fn(async () => ({
      drawings: sampleDrawings,
      users: sampleUsers,
      auditLog: sampleAuditLog
    })),
    updateDrawingSummaryFromRecord: vi.fn((drawing: { id: string; name: string; versionNumber: number }) => ({
      id: drawing.id,
      name: drawing.name,
      versionNumber: drawing.versionNumber,
      updatedAtIso: "2026-03-10T12:00:00.000Z"
    })),
    ...options?.portalOverrides
  };

  vi.doMock("react", () => ({
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
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
  vi.doMock("./portalSessionData", () => portalSessionData);

  const module = await import("./usePortalCompanyData.js");
  return {
    ...module,
    apiClient,
    apiErrors,
    portalSessionData,
    stateSetters
  };
}

describe("usePortalCompanyData", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
  });

  it("refreshes company datasets and manages user operations for an authenticated session", async () => {
    const { usePortalCompanyData, apiClient, portalSessionData, stateSetters } = await loadUsePortalCompanyData({
      stateValues: [sampleDrawings, sampleUsers, sampleAuditLog, false, false, false, false, null]
    });
    const clearMessages = vi.fn();
    const setErrorMessage = vi.fn();
    const setNoticeMessage = vi.fn();

    const state = usePortalCompanyData({
      session: sampleSession,
      clearMessages,
      setErrorMessage,
      setNoticeMessage
    });

    state.clearCompanyData();
    await state.loadCompanyData(sampleSession);
    await state.refreshDrawings();
    await state.refreshUsers();
    await state.refreshAuditLog();
    expect(await state.createUser({ displayName: "Admin", email: "admin@example.com", password: "Secret123!", role: "ADMIN" })).toBe(true);
    expect(await state.resetUserPassword("user-1", "Secret123!")).toBe(true);
    expect(await state.loadDrawingVersions("drawing-1")).toEqual([{ id: "version-1", drawingId: "drawing-1", versionNumber: 1 }]);

    expect(portalSessionData.loadPortalCompanyData).toHaveBeenCalledWith(sampleSession);
    expect(apiClient.listDrawings).toHaveBeenCalled();
    expect(apiClient.listUsers).toHaveBeenCalled();
    expect(apiClient.listAuditLog).toHaveBeenCalled();
    expect(apiClient.createUser).toHaveBeenCalledWith({
      displayName: "Admin",
      email: "admin@example.com",
      password: "Secret123!",
      role: "ADMIN"
    });
    expect(apiClient.setUserPassword).toHaveBeenCalledWith("user-1", { password: "Secret123!" });
    expect(stateSetters.drawings).toHaveBeenCalledWith([]);
    expect(stateSetters.users).toHaveBeenCalledWith([]);
    expect(stateSetters.auditLog).toHaveBeenCalledWith([]);
    expect(stateSetters.isLoadingDrawings).toHaveBeenCalledWith(true);
    expect(stateSetters.isLoadingDrawings).toHaveBeenCalledWith(false);
    expect(stateSetters.isSavingUser).toHaveBeenCalledWith(true);
    expect(stateSetters.isSavingUser).toHaveBeenCalledWith(false);
    expect(stateSetters.isResettingUserId).toHaveBeenCalledWith("user-1");
    expect(stateSetters.isResettingUserId).toHaveBeenCalledWith(null);
    expect(setErrorMessage).not.toHaveBeenCalled();
    expect(setNoticeMessage).toHaveBeenCalledWith("Added Admin");
    expect(setNoticeMessage).toHaveBeenCalledWith("Reset password for Owner. Their active sessions were revoked.");

    const userUpdater = findLastFunctionCall(stateSetters.users);
    expect(userUpdater).toBeDefined();
    expect(
      userUpdater?.([
        {
          id: "user-3",
          companyId: "company-1",
          email: "late@example.com",
          displayName: "Late User",
          role: "ADMIN",
          createdAtIso: "2026-03-10T12:30:00.000Z"
        }
      ])
    ).toEqual([
      {
        id: "user-2",
        companyId: "company-1",
        email: "admin@example.com",
        displayName: "Admin",
        role: "ADMIN",
        createdAtIso: "2026-03-10T12:00:00.000Z"
      },
      {
        id: "user-3",
        companyId: "company-1",
        email: "late@example.com",
        displayName: "Late User",
        role: "ADMIN",
        createdAtIso: "2026-03-10T12:30:00.000Z"
      }
    ]);
  });

  it("updates drawing summaries for archive and restore actions", async () => {
    const { usePortalCompanyData, portalSessionData, stateSetters } = await loadUsePortalCompanyData({
      stateValues: [sampleDrawings, sampleUsers, sampleAuditLog, false, false, false, false, null]
    });
    const setErrorMessage = vi.fn();
    const setNoticeMessage = vi.fn();

    const state = usePortalCompanyData({
      session: sampleSession,
      clearMessages: vi.fn(),
      setErrorMessage,
      setNoticeMessage
    });

    expect(await state.setDrawingArchived("drawing-1", true)).toBe(true);
    expect(await state.restoreDrawingVersion("drawing-1", 3)).toBe(true);

    expect(portalSessionData.updateDrawingSummaryFromRecord).toHaveBeenCalledTimes(2);
    expect(setErrorMessage).not.toHaveBeenCalled();
    expect(setNoticeMessage).toHaveBeenCalledWith('Archived "Archived boundary"');
    expect(setNoticeMessage).toHaveBeenCalledWith("Restored drawing version 3");

    const drawingUpdater = findLastFunctionCall(stateSetters.drawings);
    expect(drawingUpdater).toBeDefined();
    expect(drawingUpdater?.(sampleDrawings)).toEqual([
      {
        ...sampleDrawings[0],
        id: "drawing-1",
        name: "Restored boundary",
        versionNumber: 3,
        updatedAtIso: "2026-03-10T12:00:00.000Z"
      }
    ]);
  });

  it("handles unauthenticated and stale-version failure paths", async () => {
    const staleError = new Error("stale");
    const { usePortalCompanyData, stateSetters } = await loadUsePortalCompanyData({
      stateValues: [sampleDrawings, sampleUsers, sampleAuditLog, false, false, false, false, null],
      apiOverrides: {
        setDrawingArchivedState: vi.fn(async () => {
          throw staleError;
        }),
        restoreDrawingVersion: vi.fn(async () => {
          throw staleError;
        })
      },
      errorOverrides: {
        extractCurrentVersionNumber: vi.fn(() => 4)
      }
    });

    const unauthenticated = usePortalCompanyData({
      session: null,
      clearMessages: vi.fn(),
      setErrorMessage: vi.fn(),
      setNoticeMessage: vi.fn()
    });

    await unauthenticated.refreshDrawings();
    await unauthenticated.refreshUsers();
    await unauthenticated.refreshAuditLog();
    expect(await unauthenticated.createUser({ displayName: "Admin", email: "admin@example.com", password: "Secret123!", role: "ADMIN" })).toBe(false);
    expect(await unauthenticated.resetUserPassword("user-1", "Secret123!")).toBe(false);
    expect(await unauthenticated.setDrawingArchived("drawing-1", true)).toBe(false);
    expect(await unauthenticated.loadDrawingVersions("drawing-1")).toEqual([]);
    expect(await unauthenticated.restoreDrawingVersion("drawing-1", 2)).toBe(false);

    expect(stateSetters.drawings).toHaveBeenCalledWith([]);
    expect(stateSetters.users).toHaveBeenCalledWith([]);
    expect(stateSetters.auditLog).toHaveBeenCalledWith([]);

    const authenticatedLoad = await loadUsePortalCompanyData({
      stateValues: [sampleDrawings, sampleUsers, sampleAuditLog, false, false, false, false, null],
      apiOverrides: {
        setDrawingArchivedState: vi.fn(async () => {
          throw staleError;
        }),
        restoreDrawingVersion: vi.fn(async () => {
          throw staleError;
        })
      },
      errorOverrides: {
        extractCurrentVersionNumber: vi.fn(() => 4)
      }
    });
    const setErrorMessage = vi.fn();
    const state = authenticatedLoad.usePortalCompanyData({
      session: sampleSession,
      clearMessages: vi.fn(),
      setErrorMessage,
      setNoticeMessage: vi.fn()
    });

    expect(await state.setDrawingArchived("drawing-1", true)).toBe(false);
    expect(await state.restoreDrawingVersion("drawing-1", 4)).toBe(false);

    expect(authenticatedLoad.apiClient.listDrawings).toHaveBeenCalledTimes(2);
    expect(setErrorMessage).toHaveBeenCalledWith(
      '"Front boundary" changed before this action completed. The drawings list has been refreshed; retry the action.'
    );
    expect(setErrorMessage).toHaveBeenCalledWith(
      '"Front boundary" changed before this version restore completed. The drawings list has been refreshed; retry the action.'
    );
  });
});
