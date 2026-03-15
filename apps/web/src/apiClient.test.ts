import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  bootstrapOwner,
  createQuoteSnapshot,
  createDrawing,
  createUser,
  getAuthenticatedUser,
  getPricedEstimate,
  getSetupStatus,
  listAuditLog,
  listDrawingVersions,
  listDrawings,
  listQuotes,
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
              customerName: "Cleveland Land Services",
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
              createdByDisplayName: "Jane",
              updatedByUserId: "user-1",
              updatedByDisplayName: "Jane",
              contributorUserIds: ["user-1"],
              contributorDisplayNames: ["Jane"],
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
            customerName: "Cleveland Land Services",
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
            customerName: "Cleveland Land Services",
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
            customerName: "Cleveland Land Services",
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
      new Response(JSON.stringify({ versions: [{ id: "v2", drawingId: "drawing-1", companyId: "company-1", schemaVersion: TEST_SCHEMA_VERSION, rulesVersion: TEST_RULES_VERSION, versionNumber: 2, source: "UPDATE", name: "Updated yard", customerName: "Cleveland Land Services", layout: { segments: [], gates: [] }, estimate: { posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} }, corners: { total: 0, internal: 0, external: 0, unclassified: 0 }, materials: { twinBarPanels: 0, twinBarPanelsSuperRebound: 0, twinBarPanelsByStockHeightMm: {}, twinBarPanelsByFenceHeight: {}, roll2100: 0, roll900: 0, totalRolls: 0, rollsByFenceHeight: {} }, optimization: { strategy: "CHAINED_CUT_PLANNER", twinBar: { reuseAllowanceMm: 200, stockPanelWidthMm: 2525, fixedFullPanels: 0, baselinePanels: 0, optimizedPanels: 0, panelsSaved: 0, totalCutDemands: 0, stockPanelsOpened: 0, reusedCuts: 0, totalConsumedMm: 0, totalLeftoverMm: 0, reusableLeftoverMm: 0, utilizationRate: 0, buckets: [] } }, segments: [] }, createdByUserId: "user-1", createdAtIso: "2026-03-10T11:00:00.000Z" }] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Updated yard",
            customerName: "Cleveland Land Services",
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
    await createDrawing({ name: "Yard", customerName: "Cleveland Land Services", layout: { segments: [], gates: [] } });
    await updateDrawing("drawing-1", {
      expectedVersionNumber: 1,
      name: "Updated yard",
      customerName: "Cleveland Land Services",
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

  it("loads server-priced estimates from the drawing route", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pricedEstimate: {
            drawing: {
              drawingId: "drawing-1",
              drawingName: "Yard",
              customerName: "Cleveland Land Services"
            },
            groups: [],
            ancillaryItems: [],
            totals: {
              materialCost: 0,
              labourCost: 0,
              totalCost: 0
            },
            warnings: [],
            pricingSnapshot: {
              updatedAtIso: "1970-01-01T00:00:00.000Z",
              updatedByUserId: null,
              source: "DEFAULT"
            }
          }
        }),
        { status: 200 },
      ),
    );

    const pricedEstimate = await getPricedEstimate("drawing-1");

    expect(pricedEstimate.drawing.drawingId).toBe("drawing-1");
    expect(pricedEstimate.pricingSnapshot.source).toBe("DEFAULT");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/drawings/drawing-1/priced-estimate", expect.anything());
  });

  it("lists and creates immutable quote snapshots for a drawing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          quotes: [
            {
              id: "quote-1",
              companyId: "company-1",
              drawingId: "drawing-1",
              drawingVersionNumber: 2,
              pricedEstimate: {
                drawing: {
                  drawingId: "drawing-1",
                  drawingName: "Yard",
                  customerName: "Cleveland Land Services"
                },
                groups: [],
                ancillaryItems: [],
                totals: {
                  materialCost: 100,
                  labourCost: 50,
                  totalCost: 150
                },
                warnings: [],
                pricingSnapshot: {
                  updatedAtIso: "1970-01-01T00:00:00.000Z",
                  updatedByUserId: null,
                  source: "DEFAULT"
                }
              },
              drawingSnapshot: {
                drawingId: "drawing-1",
                drawingName: "Yard",
                customerName: "Cleveland Land Services",
                layout: { segments: [], gates: [], basketballPosts: [], floodlightColumns: [] },
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
                versionNumber: 2
              },
              createdByUserId: "user-1",
              createdAtIso: "2026-03-12T10:00:00.000Z"
            }
          ]
        }),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          quote: {
            id: "quote-2",
            companyId: "company-1",
            drawingId: "drawing-1",
            drawingVersionNumber: 3,
            pricedEstimate: {
              drawing: {
                drawingId: "drawing-1",
                drawingName: "Yard",
                customerName: "Cleveland Land Services"
              },
              groups: [],
              ancillaryItems: [
                {
                  id: "ancillary-1",
                  description: "Lift hire",
                  quantity: 1,
                  materialCost: 10,
                  labourCost: 5
                }
              ],
              totals: {
                materialCost: 110,
                labourCost: 55,
                totalCost: 165
              },
              warnings: [],
              pricingSnapshot: {
                updatedAtIso: "1970-01-01T00:00:00.000Z",
                updatedByUserId: null,
                source: "DEFAULT"
              }
            },
            drawingSnapshot: {
              drawingId: "drawing-1",
              drawingName: "Yard",
              customerName: "Cleveland Land Services",
              layout: { segments: [], gates: [], basketballPosts: [], floodlightColumns: [] },
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
              versionNumber: 3
            },
            createdByUserId: "user-1",
            createdAtIso: "2026-03-13T10:00:00.000Z"
          }
        }),
        { status: 201 }
      )
    );

    const listedQuotes = await listQuotes("drawing-1");
    const createdQuote = await createQuoteSnapshot("drawing-1", [
      {
        id: "ancillary-1",
        description: "Lift hire",
        quantity: 1,
        materialCost: 10,
        labourCost: 5
      }
    ]);

    expect(listedQuotes[0]?.id).toBe("quote-1");
    expect(createdQuote.id).toBe("quote-2");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/drawings/drawing-1/quotes", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/drawings/drawing-1/quotes",
      expect.objectContaining({ method: "POST" })
    );
  });
});
