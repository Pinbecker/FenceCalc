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
});
