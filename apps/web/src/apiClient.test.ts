import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  bootstrapOwner,
  createDrawing,
  createUser,
  getAuthenticatedUser,
  getSetupStatus,
  listAuditLog,
  listDrawingVersions,
  listDrawings,
  listUsers,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  restoreDrawingVersion,
  setUserPassword,
  setDrawingArchivedState,
  updateDrawing
} from "./apiClient.js";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("uses setup bootstrap endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ bootstrapRequired: true, bootstrapSecretRequired: true }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
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
            revokedAtIso: null
          }
        }),
        { status: 201 },
      ),
    );

    expect((await getSetupStatus()).bootstrapSecretRequired).toBe(true);
    expect((
      await bootstrapOwner({
        companyName: "Acme",
        displayName: "Jane",
        email: "jane@example.com",
        password: "supersecure123",
        bootstrapSecret: "bootstrap-secret"
      })
    ).session.id).toBe("session-1");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/setup/status", expect.anything());
    const bootstrapRequest = fetchMock.mock.calls[1]?.[1];
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/setup/bootstrap-owner",
      expect.objectContaining({
        method: "POST"
      }),
    );
    expect(bootstrapRequest?.headers).toMatchObject({ "x-bootstrap-secret": "bootstrap-secret" });
  });

  it("throws typed API errors from failed responses", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 }));

    await expect(login({ email: "jane@example.com", password: "bad-password" })).rejects.toMatchObject({
      message: "Invalid credentials",
      status: 401
    } satisfies Partial<ApiClientError>);
  });

  it("uses cookie-backed requests and hits the expanded portal endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: "session-1",
            companyId: "company-1",
            userId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            expiresAtIso: "2026-04-10T10:00:00.000Z",
            revokedAtIso: null
          },
          company: { id: "company-1", name: "Acme", createdAtIso: "2026-03-10T10:00:00.000Z" },
          user: {
            id: "user-1",
            companyId: "company-1",
            email: "jane@example.com",
            displayName: "Jane",
            role: "OWNER",
            createdAtIso: "2026-03-10T10:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawings: [
            {
              id: "drawing-1",
              companyId: "company-1",
              name: "Yard",
              previewLayout: { segments: [], gates: [] },
              segmentCount: 0,
              gateCount: 0,
              schemaVersion: TEST_SCHEMA_VERSION,
              rulesVersion: TEST_RULES_VERSION,
              versionNumber: 1,
              isArchived: false,
              archivedAtIso: null,
              archivedByUserId: null,
              createdByUserId: "user-1",
              updatedByUserId: "user-1",
              createdAtIso: "2026-03-10T10:00:00.000Z",
              updatedAtIso: "2026-03-10T10:00:00.000Z"
            }
          ]
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ users: [] }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
              corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
              materials: {
                twinBarPanels: 0,
                twinBarPanelsSuperRebound: 0,
                twinBarPanelsByStockHeightMm: {},
                twinBarPanelsByFenceHeight: {},
                roll2100: 0,
                roll900: 0,
                totalRolls: 0,
                rollsByFenceHeight: {}
              },
              optimization: {
                strategy: "CHAINED_CUT_PLANNER",
                twinBar: {
                  reuseAllowanceMm: 200,
                  stockPanelWidthMm: 2525,
                  fixedFullPanels: 0,
                  baselinePanels: 0,
                  optimizedPanels: 0,
                  panelsSaved: 0,
                  totalCutDemands: 0,
                  stockPanelsOpened: 0,
                  reusedCuts: 0,
                  totalConsumedMm: 0,
                  totalLeftoverMm: 0,
                  reusableLeftoverMm: 0,
                  utilizationRate: 0,
                  buckets: []
                }
              },
              segments: []
            },
            schemaVersion: TEST_SCHEMA_VERSION,
            rulesVersion: TEST_RULES_VERSION,
            versionNumber: 1,
            isArchived: false,
            archivedAtIso: null,
            archivedByUserId: null,
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T10:00:00.000Z"
          }
        }),
        { status: 201 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Updated yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
              corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
              materials: {
                twinBarPanels: 0,
                twinBarPanelsSuperRebound: 0,
                twinBarPanelsByStockHeightMm: {},
                twinBarPanelsByFenceHeight: {},
                roll2100: 0,
                roll900: 0,
                totalRolls: 0,
                rollsByFenceHeight: {}
              },
              optimization: {
                strategy: "CHAINED_CUT_PLANNER",
                twinBar: {
                  reuseAllowanceMm: 200,
                  stockPanelWidthMm: 2525,
                  fixedFullPanels: 0,
                  baselinePanels: 0,
                  optimizedPanels: 0,
                  panelsSaved: 0,
                  totalCutDemands: 0,
                  stockPanelsOpened: 0,
                  reusedCuts: 0,
                  totalConsumedMm: 0,
                  totalLeftoverMm: 0,
                  reusableLeftoverMm: 0,
                  utilizationRate: 0,
                  buckets: []
                }
              },
              segments: []
            },
            schemaVersion: TEST_SCHEMA_VERSION,
            rulesVersion: TEST_RULES_VERSION,
            versionNumber: 2,
            isArchived: false,
            archivedAtIso: null,
            archivedByUserId: null,
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T11:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Updated yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
              corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
              materials: {
                twinBarPanels: 0,
                twinBarPanelsSuperRebound: 0,
                twinBarPanelsByStockHeightMm: {},
                twinBarPanelsByFenceHeight: {},
                roll2100: 0,
                roll900: 0,
                totalRolls: 0,
                rollsByFenceHeight: {}
              },
              optimization: {
                strategy: "CHAINED_CUT_PLANNER",
                twinBar: {
                  reuseAllowanceMm: 200,
                  stockPanelWidthMm: 2525,
                  fixedFullPanels: 0,
                  baselinePanels: 0,
                  optimizedPanels: 0,
                  panelsSaved: 0,
                  totalCutDemands: 0,
                  stockPanelsOpened: 0,
                  reusedCuts: 0,
                  totalConsumedMm: 0,
                  totalLeftoverMm: 0,
                  reusableLeftoverMm: 0,
                  utilizationRate: 0,
                  buckets: []
                }
              },
              segments: []
            },
            schemaVersion: TEST_SCHEMA_VERSION,
            rulesVersion: TEST_RULES_VERSION,
            versionNumber: 2,
            isArchived: true,
            archivedAtIso: "2026-03-10T12:00:00.000Z",
            archivedByUserId: "user-1",
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T12:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ versions: [{ id: "v2", drawingId: "drawing-1", companyId: "company-1", schemaVersion: TEST_SCHEMA_VERSION, rulesVersion: TEST_RULES_VERSION, versionNumber: 2, source: "UPDATE", name: "Updated yard", layout: { segments: [], gates: [] }, estimate: { posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} }, corners: { total: 0, internal: 0, external: 0, unclassified: 0 }, materials: { twinBarPanels: 0, twinBarPanelsSuperRebound: 0, twinBarPanelsByStockHeightMm: {}, twinBarPanelsByFenceHeight: {}, roll2100: 0, roll900: 0, totalRolls: 0, rollsByFenceHeight: {} }, optimization: { strategy: "CHAINED_CUT_PLANNER", twinBar: { reuseAllowanceMm: 200, stockPanelWidthMm: 2525, fixedFullPanels: 0, baselinePanels: 0, optimizedPanels: 0, panelsSaved: 0, totalCutDemands: 0, stockPanelsOpened: 0, reusedCuts: 0, totalConsumedMm: 0, totalLeftoverMm: 0, reusableLeftoverMm: 0, utilizationRate: 0, buckets: [] } }, segments: [] }, createdByUserId: "user-1", createdAtIso: "2026-03-10T11:00:00.000Z" }] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Updated yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
              corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
              materials: {
                twinBarPanels: 0,
                twinBarPanelsSuperRebound: 0,
                twinBarPanelsByStockHeightMm: {},
                twinBarPanelsByFenceHeight: {},
                roll2100: 0,
                roll900: 0,
                totalRolls: 0,
                rollsByFenceHeight: {}
              },
              optimization: {
                strategy: "CHAINED_CUT_PLANNER",
                twinBar: {
                  reuseAllowanceMm: 200,
                  stockPanelWidthMm: 2525,
                  fixedFullPanels: 0,
                  baselinePanels: 0,
                  optimizedPanels: 0,
                  panelsSaved: 0,
                  totalCutDemands: 0,
                  stockPanelsOpened: 0,
                  reusedCuts: 0,
                  totalConsumedMm: 0,
                  totalLeftoverMm: 0,
                  reusableLeftoverMm: 0,
                  utilizationRate: 0,
                  buckets: []
                }
              },
              segments: []
            },
            schemaVersion: TEST_SCHEMA_VERSION,
            rulesVersion: TEST_RULES_VERSION,
            versionNumber: 3,
            isArchived: false,
            archivedAtIso: null,
            archivedByUserId: null,
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T13:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-2", companyId: "company-1", email: "new@example.com", displayName: "New User", role: "ADMIN", createdAtIso: "2026-03-10T10:05:00.000Z" } }), { status: 201 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await getAuthenticatedUser();
    await listDrawings();
    await listUsers();
    await listAuditLog();
    await logout();
    await createDrawing({ name: "Yard", layout: { segments: [], gates: [] } });
    await updateDrawing("drawing-1", {
      expectedVersionNumber: 1,
      name: "Updated yard",
      layout: { segments: [], gates: [] }
    });
    await setDrawingArchivedState("drawing-1", true, 2);
    await listDrawingVersions("drawing-1");
    await restoreDrawingVersion("drawing-1", 2, 2);
    await createUser({ displayName: "New User", email: "new@example.com", password: "supersecure123", role: "ADMIN" });
    await setUserPassword("user-2", { password: "supersecure123" });
    await requestPasswordReset({ email: "jane@example.com" });
    await resetPassword({ token: "reset-token", password: "supersecure123" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/me", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/drawings?scope=ALL", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/v1/audit-log?limit=50", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/v1/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, "/api/v1/drawings/drawing-1/archive", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(9, "/api/v1/drawings/drawing-1/versions", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/v1/drawings/drawing-1/restore", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(12, "/api/v1/users/user-2/password", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(13, "/api/v1/auth/request-password-reset", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(14, "/api/v1/auth/reset-password", expect.objectContaining({ method: "POST" }));
    const firstRequest = fetchMock.mock.calls[0]?.[1];
    expect(firstRequest?.credentials).toBe("include");
    expect(firstRequest?.headers).toMatchObject({ "content-type": "application/json" });
  });
});
