import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { InMemoryAppRepository } from "./repository.js";
import { registerAndGetSession, UnhealthyRepository } from "./testSupport.js";

describe("API health, setup, and auth", { timeout: 10000 }, () => {
  it("returns health status", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean; repository: string }>();
    expect(body.ok).toBe(true);
    expect(body.repository).toBe("ready");
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });

  it("returns degraded health status when the repository is unavailable", async () => {
    const app = buildApp({ repository: new UnhealthyRepository() });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    const body = response.json<{ ok: boolean; repository: string; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.repository).toBe("unavailable");
    expect(body.error).toContain("database unavailable");
    await app.close();
  });

  it("bootstraps the first company owner and sets a session cookie", async () => {
    const { app, registration, cookieHeader } = await registerAndGetSession();

    expect(registration.session.id).toBeTruthy();
    expect(cookieHeader.cookie).toContain("fence_estimator_session=");
    await app.close();
  });

  it("reports whether bootstrap requires a secret", async () => {
    const app = buildApp({
      repository: new InMemoryAppRepository(),
      config: {
        ...loadConfig(),
        databasePath: "./data/test.db",
        bootstrapOwnerSecret: "bootstrap-secret"
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/v1/setup/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ bootstrapRequired: boolean; bootstrapSecretRequired: boolean }>()).toEqual({
      bootstrapRequired: true,
      bootstrapSecretRequired: false
    });
    await app.close();
  });

  it("rejects bootstrap without the configured secret", async () => {
    const app = buildApp({
      repository: new InMemoryAppRepository(),
      config: {
        ...loadConfig(),
        databasePath: "./data/test.db",
        bootstrapOwnerSecret: "bootstrap-secret"
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

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe("Bootstrap secret is required");
    await app.close();
  });

  it("rejects a second bootstrap attempt after the first owner is created", async () => {
    const { app } = await registerAndGetSession({ bootstrapOwnerSecret: "bootstrap-secret" });

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/v1/setup/bootstrap-owner",
      headers: { "x-bootstrap-secret": "bootstrap-secret" },
      payload: {
        companyName: "Other Co",
        displayName: "John Doe",
        email: "john@example.com",
        password: "supersecure123"
      }
    });

    expect(secondResponse.statusCode).toBe(409);
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
    const { app } = await registerAndGetSession();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "supersecure123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { email: string } }>().user.email).toBe("jane@example.com");
    await app.close();
  });

  it("locks sign-in after repeated failed attempts", async () => {
    const { app } = await registerAndGetSession({
      loginMaxAttempts: 2,
      loginLockoutMs: 60000,
      loginAttemptWindowMs: 60000
    });

    const firstFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "wrongpassword123"
      }
    });

    const secondFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "wrongpassword123"
      }
    });

    const locked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "supersecure123"
      }
    });

    expect(firstFailure.statusCode).toBe(401);
    expect(secondFailure.statusCode).toBe(401);
    expect(locked.statusCode).toBe(429);
    expect(locked.json<{ error: string }>().error).toContain("Too many failed sign-in attempts");
    await app.close();
  });

  it("treats email casing as the same lockout key", async () => {
    const { app } = await registerAndGetSession({
      loginMaxAttempts: 2,
      loginLockoutMs: 60000,
      loginAttemptWindowMs: 60000
    });

    const firstFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "Jane@Example.com",
        password: "wrongpassword123"
      }
    });

    const secondFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "wrongpassword123"
      }
    });

    const locked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "JANE@EXAMPLE.COM",
        password: "supersecure123"
      }
    });

    expect(firstFailure.statusCode).toBe(401);
    expect(secondFailure.statusCode).toBe(401);
    expect(locked.statusCode).toBe(429);
    await app.close();
  });

  it("clears failed attempts after a successful sign-in", async () => {
    const { app } = await registerAndGetSession({
      loginMaxAttempts: 2,
      loginLockoutMs: 60000,
      loginAttemptWindowMs: 60000
    });

    const firstFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "wrongpassword123"
      }
    });

    const success = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "supersecure123"
      }
    });

    const nextFailure = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "wrongpassword123"
      }
    });

    expect(firstFailure.statusCode).toBe(401);
    expect(success.statusCode).toBe(200);
    expect(nextFailure.statusCode).toBe(401);
    await app.close();
  });

  it("disables password reset until a secure delivery channel exists", async () => {
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
    expect(requestReset.statusCode).toBe(501);

    const confirmReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: "x".repeat(64),
        password: "evenmoresecure123"
      }
    });
    expect(confirmReset.statusCode).toBe(501);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "jane@example.com",
        password: "supersecure123"
      }
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });
});
