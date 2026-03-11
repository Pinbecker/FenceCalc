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
    url: "/api/v1/setup/bootstrap-owner",
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

describe("API", { timeout: 10000 }, () => {
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

  it("bootstraps the first company owner and returns a session token", async () => {
    const { app, registration } = await registerAndGetToken();

    expect(registration.session.token).toHaveLength(64);
    await app.close();
  });

  it("disables public self-registration", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });

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

    expect(response.statusCode).toBe(403);
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
        versionNumber: number;
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
    const updatedDrawing = update.json<{ drawing: { name: string; versionNumber: number } }>().drawing;
    expect(updatedDrawing.name).toBe("Updated yard perimeter");
    expect(updatedDrawing.versionNumber).toBe(2);

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/versions`,
      headers: authHeader
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json<{ versions: Array<{ versionNumber: number }> }>().versions).toHaveLength(2);
    await app.close();
  });

  it("allows owners to provision company users", async () => {
    const { app, registration } = await registerAndGetToken();
    const authHeader = { authorization: `Bearer ${registration.session.token}` };

    const createUser = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: authHeader,
      payload: {
        displayName: "John Smith",
        email: "john@example.com",
        password: "supersecure123",
        role: "ADMIN"
      }
    });

    expect(createUser.statusCode).toBe(201);
    expect(createUser.json<{ user: { role: string } }>().user.role).toBe("ADMIN");

    const listUsers = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: authHeader
    });

    expect(listUsers.statusCode).toBe(200);
    expect(listUsers.json<{ users: Array<{ email: string }> }>().users).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "john@example.com" })]),
    );
    await app.close();
  });

  it("archives drawings, exposes audit log, and supports logout", async () => {
    const { app, registration } = await registerAndGetToken();
    const authHeader = { authorization: `Bearer ${registration.session.token}` };

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: authHeader,
      payload: {
        name: "Archive me",
        layout: { segments: [] }
      }
    });
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const archive = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}/archive`,
      headers: authHeader,
      payload: {
        archived: true
      }
    });

    expect(archive.statusCode).toBe(200);
    expect(archive.json<{ drawing: { isArchived: boolean } }>().drawing.isArchived).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=10",
      headers: authHeader
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ entries: Array<{ action: string }> }>().entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "DRAWING_ARCHIVED" })]),
    );

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: authHeader
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("supports password reset requests and confirmations", async () => {
    const repository = new InMemoryAppRepository();
    const app = buildApp({
      repository,
      config: {
        ...loadConfig(),
        databasePath: "./data/test.db",
        writeRateLimitMaxRequests: 50
      }
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/setup/bootstrap-owner",
      payload: {
        companyName: "Acme Fencing",
        displayName: "Jane Doe",
        email: "jane@example.com",
        password: "supersecure123"
      }
    });

    const requestReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-password-reset",
      payload: {
        email: "jane@example.com"
      }
    });
    expect(requestReset.statusCode).toBe(202);

    const audit = await repository.listAuditLog((await repository.getUserByEmail("jane@example.com"))?.companyId ?? "");
    const resetToken = audit[0]?.metadata?.resetToken;
    expect(typeof resetToken).toBe("string");

    const confirmReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        password: "evenmoresecure123"
      }
    });
    expect(confirmReset.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "evenmoresecure123"
      }
    });
    expect(login.statusCode).toBe(200);
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
