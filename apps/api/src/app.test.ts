import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("API", () => {
  it("returns health status", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    await app.close();
  });

  it("returns estimate for valid layout", async () => {
    const app = buildApp();
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

  it("normalizes coordinates when creating snapshots", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/snapshots",
      payload: {
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0.4, y: 0.2 },
              end: { x: 10000.6, y: 0.8 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ]
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ layout: { segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> } }>();
    expect(body.layout.segments[0]?.start).toEqual({ x: 0, y: 0 });
    expect(body.layout.segments[0]?.end).toEqual({ x: 10001, y: 1 });
    await app.close();
  });

  it("rejects invalid estimate payloads", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
      payload: {
        segments: [
          {
            id: "",
            start: { x: 0, y: 0 },
            end: { x: 10000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
