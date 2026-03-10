import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  createDrawing,
  getAuthenticatedUser,
  getDrawing,
  listDrawings,
  login,
  registerAccount,
  updateDrawing
} from "./apiClient.js";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("sends auth registration payloads", async () => {
    fetchMock.mockResolvedValue(
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
            token: "secret"
          }
        }),
        { status: 201 },
      ),
    );

    const result = await registerAccount({
      companyName: "Acme",
      displayName: "Jane",
      email: "jane@example.com",
      password: "supersecure123"
    });

    expect(result.session.token).toBe("secret");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          companyName: "Acme",
          displayName: "Jane",
          email: "jane@example.com",
          password: "supersecure123"
        })
      }),
    );
  });

  it("throws typed API errors from failed responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 }),
    );

    await expect(
      login({
        email: "jane@example.com",
        password: "bad-password"
      }),
    ).rejects.toMatchObject({ message: "Invalid credentials", status: 401 } satisfies Partial<ApiClientError>);
  });

  it("attaches bearer tokens to drawing requests", async () => {
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
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drawings: [] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: {
                terminal: 0,
                intermediate: 0,
                total: 0,
                cornerPosts: 0,
                byHeightAndType: {},
                byHeightMm: {}
              },
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
            name: "Yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: {
                terminal: 0,
                intermediate: 0,
                total: 0,
                cornerPosts: 0,
                byHeightAndType: {},
                byHeightMm: {}
              },
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
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T10:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          drawing: {
            id: "drawing-1",
            companyId: "company-1",
            name: "Updated yard",
            layout: { segments: [], gates: [] },
            estimate: {
              posts: {
                terminal: 0,
                intermediate: 0,
                total: 0,
                cornerPosts: 0,
                byHeightAndType: {},
                byHeightMm: {}
              },
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
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            createdAtIso: "2026-03-10T10:00:00.000Z",
            updatedAtIso: "2026-03-10T10:00:00.000Z"
          }
        }),
        { status: 200 },
      ),
    );

    await getAuthenticatedUser("secret");
    await listDrawings("secret");
    await createDrawing("secret", {
      name: "Yard",
      layout: { segments: [], gates: [] }
    });
    await getDrawing("secret", "drawing-1");
    await updateDrawing("secret", "drawing-1", {
      name: "Updated yard",
      layout: { segments: [], gates: [] }
    });

    const authMeInit = fetchMock.mock.calls[0]?.[1];
    const createDrawingInit = fetchMock.mock.calls[2]?.[1];

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/me", expect.anything());
    expect(authMeInit?.headers).toEqual(expect.objectContaining({ authorization: "Bearer secret" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/drawings", expect.anything());
    expect(createDrawingInit?.method).toBe("POST");
    expect(createDrawingInit?.headers).toEqual(expect.objectContaining({ authorization: "Bearer secret" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/drawings/drawing-1",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/v1/drawings/drawing-1",
      expect.objectContaining({
        method: "PUT"
      }),
    );
  });
});
