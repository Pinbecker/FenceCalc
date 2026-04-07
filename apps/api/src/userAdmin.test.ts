import { describe, expect, it } from "vitest";

import { registerAndGetSession, getCookieHeader } from "./testSupport.js";

describe("API user administration", { timeout: 10000 }, () => {
  it("allows owners to provision company users", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createUser = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
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
      headers: cookieHeader
    });

    expect(listUsers.statusCode).toBe(200);
    expect(listUsers.json<{ users: Array<{ email: string }> }>().users).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "john@example.com" })]),
    );
    await app.close();
  });

  it("lets a manager reset another user's password and revokes active sessions", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createUser = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "John Smith",
        email: "john@example.com",
        password: "supersecure123",
        role: "ADMIN"
      }
    });
    expect(createUser.statusCode).toBe(201);
    const userId = createUser.json<{ user: { id: string } }>().user.id;

    const loginBeforeReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "john@example.com",
        password: "supersecure123"
      }
    });
    expect(loginBeforeReset.statusCode).toBe(200);
    const userCookieHeader = getCookieHeader(loginBeforeReset);

    const resetPassword = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${userId}/password`,
      headers: cookieHeader,
      payload: {
        password: "evenmoresecure123"
      }
    });
    expect(resetPassword.statusCode).toBe(202);

    const userMeAfterReset = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: userCookieHeader
    });
    expect(userMeAfterReset.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "john@example.com",
        password: "supersecure123"
      }
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "john@example.com",
        password: "evenmoresecure123"
      }
    });
    expect(newPasswordLogin.statusCode).toBe(200);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=20",
      headers: cookieHeader
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ entries: Array<{ action: string }> }>().entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "USER_PASSWORD_RESET" })]),
    );

    await app.close();
  });

  it("rejects manager password recovery for the current session user", async () => {
    const { app, cookieHeader, registration } = await registerAndGetSession();

    const resetSelf = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${registration.user.id}/password`,
      headers: cookieHeader,
      payload: {
        password: "evenmoresecure123"
      }
    });

    expect(resetSelf.statusCode).toBe(400);
    await app.close();
  });

  it("applies audit filters and exports matching csv rows", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createUser = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "John Smith",
        email: "john@example.com",
        password: "supersecure123",
        role: "ADMIN"
      }
    });
    expect(createUser.statusCode).toBe(201);
    const userId = createUser.json<{ user: { id: string } }>().user.id;

    const resetPassword = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${userId}/password`,
      headers: cookieHeader,
      payload: {
        password: "evenmoresecure123"
      }
    });
    expect(resetPassword.statusCode).toBe(202);

    const filteredAudit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=20&entityType=USER&search=password",
      headers: cookieHeader
    });
    expect(filteredAudit.statusCode).toBe(200);
    expect(filteredAudit.json<{ entries: Array<{ action: string; entityType: string }> }>().entries).toEqual([
      expect.objectContaining({ action: "USER_PASSWORD_RESET", entityType: "USER" })
    ]);

    const exportedAudit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log/export?entityType=USER&search=password",
      headers: cookieHeader
    });
    expect(exportedAudit.statusCode).toBe(200);
    expect(exportedAudit.headers["content-type"]).toContain("text/csv");
    expect(exportedAudit.headers["content-disposition"]).toMatch(
      /^attachment; filename="audit-log-[^"]+\.csv"$/,
    );

    const csv = exportedAudit.body;
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("createdAtIso,entityType,action,summary,actorUserId,entityId,metadataJson");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("USER_PASSWORD_RESET");
    expect(lines[1]).not.toContain("USER_CREATED");

    await app.close();
  });

  it("supports workspace audit filtering and export", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createCustomer = await app.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: cookieHeader,
      payload: {
        name: "Operations Yard"
      }
    });
    expect(createCustomer.statusCode).toBe(201);
    const customerId = createCustomer.json<{ customer: { id: string } }>().customer.id;

    const createWorkspace = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "North boundary",
        notes: ""
      }
    });
    expect(createWorkspace.statusCode).toBe(201);

    const filteredAudit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=20&entityType=WORKSPACE&search=workspace",
      headers: cookieHeader
    });
    expect(filteredAudit.statusCode).toBe(200);
    expect(filteredAudit.json<{ entries: Array<{ action: string; entityType: string }> }>().entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "WORKSPACE_CREATED", entityType: "WORKSPACE" })
      ]),
    );

    const exportedAudit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log/export?entityType=WORKSPACE&search=workspace",
      headers: cookieHeader
    });
    expect(exportedAudit.statusCode).toBe(200);
    expect(exportedAudit.body).toContain("WORKSPACE_CREATED");

    await app.close();
  });
});
