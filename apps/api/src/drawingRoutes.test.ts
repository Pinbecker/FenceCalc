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

  it("rejects stale drawing updates with a version conflict", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Conflict test",
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
});
