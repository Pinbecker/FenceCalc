import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { userHasPermission } from "../src/authorization.js";
import { buildApp } from "../src/buildApp.js";
import { loadConfig } from "../src/config.js";
import { buildSessionCookieHeader } from "../src/sessionHttp.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function testConfig(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "fence-estimator-security-"));
  directories.push(directory);
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_PROVIDER: "sqlite",
    DATABASE_PATH: join(directory, "security.db"),
    ALLOWED_ORIGINS: "https://estimator.example.com",
    ...overrides,
  });
}

describe("commercial security boundaries", () => {
  it("keeps company administration and destructive actions out of the estimator role", () => {
    const user = {
      id: "user-1",
      companyId: "company-1",
      email: "user@example.com",
      displayName: "Estimator",
      role: "USER" as const,
      createdAtIso: "2026-08-30T00:00:00.000Z",
    };
    expect(userHasPermission(user, "WORKSPACE_WRITE")).toBe(true);
    expect(userHasPermission(user, "COMMERCIAL_WRITE")).toBe(true);
    expect(userHasPermission(user, "COMPANY_MANAGE")).toBe(false);
    expect(userHasPermission(user, "PRICING_MANAGE")).toBe(false);
    expect(userHasPermission(user, "DESTRUCTIVE_WRITE")).toBe(false);
  });

  it("rejects unsafe requests without a trusted browser origin", async () => {
    const app = buildApp({ config: testConfig({ ENFORCE_WRITE_ORIGIN: "true" }) });
    const missing = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: {} });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toEqual({ error: "Request origin is not allowed" });
    const trusted = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: "https://estimator.example.com" },
      payload: {},
    });
    expect(trusted.statusCode).toBe(403);
    expect(trusted.json()).toEqual({ error: "Self-service registration is disabled" });
    await app.close();
  });

  it("builds host-only secure production session cookies", () => {
    const config = testConfig({
      SESSION_COOKIE_NAME: "__Host-fence_estimator_session",
      SESSION_COOKIE_SECURE: "true",
    });
    expect(buildSessionCookieHeader(config, "token-value")).toContain(
      "__Host-fence_estimator_session=token-value",
    );
    expect(buildSessionCookieHeader(config, "token-value")).toContain("HttpOnly");
    expect(buildSessionCookieHeader(config, "token-value")).toContain("Secure");
    expect(buildSessionCookieHeader(config, "token-value")).toContain("SameSite=Lax");
  });

  it("separates liveness, readiness and protected operational metrics", async () => {
    const app = buildApp({ config: testConfig({ METRICS_BEARER_TOKEN: "metrics-test-token" }) });
    try {
      const live = await app.inject({ method: "GET", url: "/livez" });
      expect(live.statusCode).toBe(200);
      const ready = await app.inject({ method: "GET", url: "/readyz" });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({
        ok: true,
        repository: "ready",
        database: { provider: "sqlite", schemaVersion: 5 },
      });
      expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
      const metrics = await app.inject({
        method: "GET",
        url: "/metrics",
        headers: { authorization: "Bearer metrics-test-token" },
      });
      expect(metrics.statusCode).toBe(200);
      expect(metrics.body).toContain("fence_estimator_http_requests_total");
      expect(metrics.body).toMatch(/fence_estimator_ready\{[^}]+\} 1/);
    } finally {
      await app.close();
    }
  });
});
