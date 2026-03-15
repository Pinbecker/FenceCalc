import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { InMemoryAppRepository } from "./repository.js";
import { getCookieHeader, registerAndGetSession } from "./testSupport.js";

describe("API drawing routes", { timeout: 10000 }, () => {
  it("returns estimate for valid layout", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
      headers: cookieHeader,
      payload: {
        segments: [
          {
            id: "one",
            start: { x: 0, y: 0 },
            end: { x: 10000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ estimate: { materials: { twinBarPanels: number } } }>().estimate.materials.twinBarPanels).toBe(4);
    await app.close();
  });

  it("creates, lists, loads, and updates drawings for the authenticated company", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Yard perimeter",
        customerName: "Cleveland Land Services",
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0.4, y: 0.2 },
              end: { x: 10000.6, y: 0.8 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: [
            {
              id: "gate-1",
              segmentId: "one",
              startOffsetMm: 4000.2,
              endOffsetMm: 5200.6,
              gateType: "SINGLE_LEAF"
            }
          ]
        },
        savedViewport: {
          x: 320,
          y: 180,
          scale: 0.27
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const createdBody = create.json<{
      drawing: {
        id: string;
        versionNumber: number;
        savedViewport?: { x: number; y: number; scale: number } | null;
        layout: {
          segments: Array<{ end: { x: number; y: number } }>;
          gates: Array<{ startOffsetMm: number; endOffsetMm: number }>;
        };
        estimate: { posts: { total: number } };
      };
    }>();
    const drawingId = createdBody.drawing.id;
    expect(createdBody.drawing.layout.gates[0]).toMatchObject({
      startOffsetMm: 4000,
      endOffsetMm: 5201
    });
    expect(createdBody.drawing.estimate.posts.total).toBe(6);
    expect(createdBody.drawing.versionNumber).toBe(1);
    expect(createdBody.drawing.savedViewport).toEqual({ x: 320, y: 180, scale: 0.27 });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/drawings",
      headers: cookieHeader
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ drawings: Array<{ id: string }> }>().drawings[0]?.id).toBe(drawingId);

    const load = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader
    });
    expect(load.statusCode).toBe(200);
    const loadedDrawing = load.json<{
      drawing: {
        savedViewport?: { x: number; y: number; scale: number } | null;
        layout: {
          segments: Array<{ end: { x: number; y: number } }>;
          gates: Array<{ startOffsetMm: number; endOffsetMm: number }>;
        };
      };
    }>().drawing;
    expect(loadedDrawing.layout.segments[0]?.end).toEqual({
      x: 10001,
      y: 1
    });
    expect(loadedDrawing.layout.gates[0]).toMatchObject({
      startOffsetMm: 4000,
      endOffsetMm: 5201
    });
    expect(loadedDrawing.savedViewport).toEqual({ x: 320, y: 180, scale: 0.27 });

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Updated yard perimeter",
        savedViewport: {
          x: 640,
          y: 260,
          scale: 0.42
        }
      }
    });
    expect(update.statusCode).toBe(200);
    const updatedDrawing = update.json<{
      drawing: { name: string; versionNumber: number; savedViewport?: { x: number; y: number; scale: number } | null };
    }>().drawing;
    expect(updatedDrawing.name).toBe("Updated yard perimeter");
    expect(updatedDrawing.versionNumber).toBe(2);
    expect(updatedDrawing.savedViewport).toEqual({ x: 640, y: 260, scale: 0.42 });

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/versions`,
      headers: cookieHeader
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json<{ versions: Array<{ versionNumber: number }> }>().versions).toHaveLength(2);
    await app.close();
  });

  it("returns a server-priced estimate with pricing snapshot metadata", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Priced estimate test",
        customerName: "Cleveland Land Services",
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0, y: 0 },
              end: { x: 5050, y: 0 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: []
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const pricedEstimate = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/priced-estimate`,
      headers: cookieHeader
    });

    expect(pricedEstimate.statusCode).toBe(200);
    expect(pricedEstimate.json<{
      pricedEstimate: {
        drawing: { drawingId: string };
        groups: Array<{ key: string }>;
        pricingSnapshot: { source: string };
      };
    }>().pricedEstimate).toMatchObject({
      drawing: { drawingId },
      pricingSnapshot: { source: "DEFAULT" }
    });
    expect(
      pricedEstimate.json<{ pricedEstimate: { groups: Array<{ key: string }> } }>().pricedEstimate.groups.map((group) => group.key)
    ).toContain("panels");

    await app.close();
  });

  it("creates and lists immutable quote snapshots for a drawing", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Quoted yard",
        customerName: "Cleveland Land Services",
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0, y: 0 },
              end: { x: 5050, y: 0 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: []
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const quoteCreate = await app.inject({
      method: "POST",
      url: `/api/v1/drawings/${drawingId}/quotes`,
      headers: cookieHeader,
      payload: {
        ancillaryItems: [
          {
            id: "ancillary-1",
            description: "Lift hire",
            quantity: 1,
            materialCost: 50,
            labourCost: 10
          }
        ]
      }
    });

    expect(quoteCreate.statusCode).toBe(201);
    const createdQuote = quoteCreate.json<{
      quote: {
        drawingId: string;
        drawingVersionNumber: number;
        pricedEstimate: { ancillaryItems: Array<{ description: string }>; totals: { totalCost: number } };
      };
    }>().quote;
    expect(createdQuote.drawingId).toBe(drawingId);
    expect(createdQuote.drawingVersionNumber).toBe(1);
    expect(createdQuote.pricedEstimate.ancillaryItems[0]?.description).toBe("Lift hire");

    const quoteList = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/quotes`,
      headers: cookieHeader
    });

    expect(quoteList.statusCode).toBe(200);
    expect(quoteList.json<{ quotes: Array<{ drawingVersionNumber: number }> }>().quotes).toEqual([
      expect.objectContaining({ drawingVersionNumber: 1 })
    ]);

    await app.close();
  });

  it("rejects stale drawing updates with a version conflict", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Conflict test",
        customerName: "Cleveland Land Services",
        layout: { segments: [] }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Conflict test v2"
      }
    });
    expect(update.statusCode).toBe(200);

    const staleUpdate = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Conflict test stale"
      }
    });

    expect(staleUpdate.statusCode).toBe(409);
    expect(staleUpdate.json<{ details: { currentVersionNumber: number } }>().details.currentVersionNumber).toBe(2);
    await app.close();
  });

  it("archives drawings, exposes audit log, and supports logout", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Archive me",
        customerName: "Cleveland Land Services",
        layout: { segments: [] }
      }
    });
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const archive = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}/archive`,
      headers: cookieHeader,
      payload: {
        archived: true,
        expectedVersionNumber: 1
      }
    });

    expect(archive.statusCode).toBe(200);
    expect(archive.json<{ drawing: { isArchived: boolean } }>().drawing.isArchived).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=10",
      headers: cookieHeader
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ entries: Array<{ action: string }> }>().entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "DRAWING_ARCHIVED" })]),
    );

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: cookieHeader
    });
    expect(logout.statusCode).toBe(200);
    expect(getCookieHeader(logout).cookie).toContain("fence_estimator_session=");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: cookieHeader
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("rejects drawing access without a valid session", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/drawings"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects estimate access without a valid session", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
      payload: {
        segments: []
      }
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns and updates company pricing configuration", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const initial = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: cookieHeader
    });

    expect(initial.statusCode).toBe(200);
    const initialBody = initial.json<{ pricingConfig: { items: Array<{ itemCode: string; materialCost: number }> } }>();
    expect(initialBody.pricingConfig.items.find((item) => item.itemCode === "TWIN_BAR_GENERAL_PLANT")?.materialCost).toBe(700);

    const updatedItems = initialBody.pricingConfig.items.map((item) =>
      item.itemCode === "TWIN_BAR_GENERAL_PLANT" ? { ...item, materialCost: 850 } : item
    );

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/pricing-config",
      headers: cookieHeader,
      payload: {
        items: updatedItems
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json<{ pricingConfig: { items: Array<{ itemCode: string; materialCost: number }> } }>()
      .pricingConfig.items.find((item) => item.itemCode === "TWIN_BAR_GENERAL_PLANT")?.materialCost).toBe(850);

    await app.close();
  });

  it("rejects pricing configuration access for members while allowing admins", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createMember = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "Team Member",
        email: "member@example.com",
        password: "membersecure123",
        role: "MEMBER"
      }
    });
    expect(createMember.statusCode).toBe(201);

    const createAdmin = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "Ops Admin",
        email: "admin@example.com",
        password: "adminsecure123",
        role: "ADMIN"
      }
    });
    expect(createAdmin.statusCode).toBe(201);

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "member@example.com",
        password: "membersecure123"
      }
    });
    expect(memberLogin.statusCode).toBe(200);
    const memberCookieHeader = getCookieHeader(memberLogin);

    const memberGet = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: memberCookieHeader
    });
    expect(memberGet.statusCode).toBe(403);

    const memberPut = await app.inject({
      method: "PUT",
      url: "/api/v1/pricing-config",
      headers: memberCookieHeader,
      payload: {
        items: []
      }
    });
    expect(memberPut.statusCode).toBe(403);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "admin@example.com",
        password: "adminsecure123"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookieHeader = getCookieHeader(adminLogin);

    const adminGet = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: adminCookieHeader
    });
    expect(adminGet.statusCode).toBe(200);

    await app.close();
  });
});
