import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { InMemoryAppRepository } from "./repository.js";

async function registerAndGetToken() {
  const app = buildApp({
    repository: new InMemoryAppRepository(),
    config: {
      ...loadConfig(),
      databasePath: "./data/test.db",
      writeRateLimitMaxRequests: 50
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      companyName: "Acme Fencing",
      displayName: "Jane Doe",
      email: "jane@example.com",
      password: "supersecure123"
    }
  });

  return {
    app,
    registration: response.json<{ session: { token: string } }>()
  };
}

describe("API", () => {
  it("returns health status", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    await app.close();
  });

  it("returns estimate for valid layout", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
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
    const body = response.json<{ estimate: { materials: { twinBarPanels: number } } }>();
    expect(body.estimate.materials.twinBarPanels).toBe(4);
    await app.close();
  });

  it("registers a company owner and returns a session token", async () => {
    const { app, registration } = await registerAndGetToken();

    expect(registration.session.token).toHaveLength(64);
    await app.close();
  });

  it("logs an existing user in", async () => {
    const { app } = await registerAndGetToken();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "supersecure123"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { email: string } }>();
    expect(body.user.email).toBe("jane@example.com");
    await app.close();
  });

  it("creates, lists, loads, and updates drawings for the authenticated company", async () => {
    const { app, registration } = await registerAndGetToken();
    const authHeader = { authorization: `Bearer ${registration.session.token}` };

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: authHeader,
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
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const createdBody = create.json<{
      drawing: {
        id: string;
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

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/drawings",
      headers: authHeader
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ drawings: Array<{ id: string }> }>().drawings[0]?.id).toBe(drawingId);

    const load = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}`,
      headers: authHeader
    });
    expect(load.statusCode).toBe(200);
    const loadedDrawing = load.json<{
      drawing: {
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

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: authHeader,
      payload: {
        name: "Updated yard perimeter"
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json<{ drawing: { name: string } }>().drawing.name).toBe("Updated yard perimeter");
    await app.close();
  });

  it("rejects drawing access without a bearer token", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/drawings"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
