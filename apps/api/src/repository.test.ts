import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { DRAWING_SCHEMA_VERSION, type EstimateResult, type LayoutModel } from "@fence-estimator/contracts";
import { RULES_ENGINE_VERSION } from "@fence-estimator/rules-engine";

import { InMemoryAppRepository, SqliteAppRepository } from "./repository.js";

const emptyLayout: LayoutModel = {
  segments: []
};

const emptyEstimate: EstimateResult = {
  posts: {
    terminal: 0,
    intermediate: 0,
    total: 0,
    cornerPosts: 0,
    byHeightAndType: {},
    byHeightMm: {}
  },
  corners: {
    total: 0,
    internal: 0,
    external: 0,
    unclassified: 0
  },
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
};

describe("InMemoryAppRepository", () => {
  it("stores owner accounts and retrieves users by email", async () => {
    const repository = new InMemoryAppRepository();

    const account = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    expect(account).not.toBeNull();

    await expect(repository.getUserByEmail("jane@example.com")).resolves.toMatchObject({
      id: "user-1",
      companyId: "company-1"
    });
  });

  it("allows bootstrap only once", async () => {
    const repository = new InMemoryAppRepository();

    const firstAccount = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    const secondAccount = await repository.bootstrapOwnerAccount({
      companyId: "company-2",
      companyName: "Other",
      userId: "user-2",
      displayName: "John",
      email: "john@example.com",
      passwordHash: "hash-2",
      passwordSalt: "salt-2",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });

    expect(firstAccount).not.toBeNull();
    expect(secondAccount).toBeNull();
    await expect(repository.getUserCount()).resolves.toBe(1);
  });

  it("stores and updates drawings per company", async () => {
    const repository = new InMemoryAppRepository();
    await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Initial",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: { x: 120, y: 90, scale: 0.2 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    const drawings = await repository.listDrawings("company-1");
    expect(drawings).toHaveLength(1);
    expect(drawings[0]).toMatchObject({
      segmentCount: 0,
      gateCount: 0,
      previewLayout: { segments: [] },
      versionNumber: 1,
      isArchived: false
    });
    await expect(repository.getDrawingById("drawing-1", "company-1")).resolves.toMatchObject({
      savedViewport: { x: 120, y: 90, scale: 0.2 }
    });

    const updated = await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      name: "Updated",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: { x: 320, y: 160, scale: 0.35 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });

    expect(updated?.name).toBe("Updated");
    expect(updated?.versionNumber).toBe(2);
    expect(updated?.savedViewport).toEqual({ x: 320, y: 160, scale: 0.35 });
    await expect(repository.listDrawingVersions("drawing-1", "company-1")).resolves.toHaveLength(2);
  });

  it("stores immutable quotes against a drawing version", async () => {
    const repository = new InMemoryAppRepository();
    await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Quoted drawing",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: null,
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createQuote({
      id: "quote-1",
      companyId: "company-1",
      drawingId: "drawing-1",
      drawingVersionNumber: 1,
      pricedEstimate: {
        drawing: {
          drawingId: "drawing-1",
          drawingName: "Quoted drawing",
          customerName: "Cleveland Land Services"
        },
        groups: [],
        ancillaryItems: [],
        totals: {
          materialCost: 100,
          labourCost: 20,
          totalCost: 120
        },
        warnings: [],
        pricingSnapshot: {
          updatedAtIso: new Date(0).toISOString(),
          updatedByUserId: null,
          source: "DEFAULT"
        }
      },
      drawingSnapshot: {
        drawingId: "drawing-1",
        drawingName: "Quoted drawing",
        customerName: "Cleveland Land Services",
        layout: emptyLayout,
        estimate: emptyEstimate,
        schemaVersion: DRAWING_SCHEMA_VERSION,
        rulesVersion: RULES_ENGINE_VERSION,
        versionNumber: 1
      },
      createdByUserId: "user-1",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });

    const quotes = await repository.listQuotesForDrawing("drawing-1", "company-1");
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      id: "quote-1",
      drawingVersionNumber: 1,
      pricedEstimate: { totals: { totalCost: 120 } }
    });
  });

  it("stores company users beyond the owner account", async () => {
    const repository = new InMemoryAppRepository();
    await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createUser({
      id: "user-2",
      companyId: "company-1",
      displayName: "John",
      email: "john@example.com",
      role: "ADMIN",
      passwordHash: "hash-2",
      passwordSalt: "salt-2",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });

    await expect(repository.getUserCount()).resolves.toBe(2);
    await expect(repository.listUsers("company-1")).resolves.toHaveLength(2);
  });

  it("updates stored passwords and revokes all active sessions for a user", async () => {
    const repository = new InMemoryAppRepository();
    await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createUser({
      id: "user-2",
      companyId: "company-1",
      displayName: "John",
      email: "john@example.com",
      role: "ADMIN",
      passwordHash: "hash-2",
      passwordSalt: "salt-2",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });
    await repository.createSession({
      id: "session-2",
      companyId: "company-1",
      userId: "user-2",
      tokenHash: "token-hash-2",
      createdAtIso: "2026-03-10T02:00:00.000Z",
      expiresAtIso: "2026-04-10T02:00:00.000Z"
    });

    await repository.updateUserPassword("user-2", "company-1", "hash-3", "salt-3");
    await repository.revokeSessionsForUser("user-2", "company-1", "2026-03-10T03:00:00.000Z");

    await expect(repository.getUserById("user-2", "company-1")).resolves.toMatchObject({
      id: "user-2",
      email: "john@example.com"
    });
    await expect(repository.getUserByEmail("john@example.com")).resolves.toMatchObject({
      passwordHash: "hash-3",
      passwordSalt: "salt-3"
    });
    await expect(repository.getAuthenticatedSession("token-hash-2")).resolves.toBeNull();
  });

  it("archives drawings, restores versions, and records audit items", async () => {
    const repository = new InMemoryAppRepository();
    await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Initial",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: { x: 120, y: 90, scale: 0.2 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });
    await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      name: "Updated",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: { x: 440, y: 210, scale: 0.45 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });

    const archived = await repository.setDrawingArchivedState({
      drawingId: "drawing-1",
      companyId: "company-1",
      archived: true,
      archivedAtIso: "2026-03-12T00:00:00.000Z",
      archivedByUserId: "user-1",
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-12T00:00:00.000Z"
    });

    expect(archived?.isArchived).toBe(true);
    await expect(repository.listDrawings("company-1", "ARCHIVED")).resolves.toHaveLength(1);

    const restored = await repository.restoreDrawingVersion({
      drawingId: "drawing-1",
      companyId: "company-1",
      versionNumber: 1,
      restoredByUserId: "user-1",
      restoredAtIso: "2026-03-13T00:00:00.000Z"
    });

    expect(restored?.versionNumber).toBe(3);
    expect(restored?.savedViewport).toEqual({ x: 120, y: 90, scale: 0.2 });

    await repository.addAuditLog({
      id: "audit-1",
      companyId: "company-1",
      actorUserId: "user-1",
      entityType: "DRAWING",
      entityId: "drawing-1",
      action: "DRAWING_UPDATED",
      summary: "Updated drawing",
      createdAtIso: "2026-03-13T00:00:00.000Z"
    });

    await expect(repository.listAuditLog("company-1")).resolves.toHaveLength(1);
  });
});

describe("SqliteAppRepository", () => {
  it("persists accounts, sessions, and drawings", async () => {
    const repository = new SqliteAppRepository(join(tmpdir(), `fence-estimator-${randomUUID()}.db`));

    const account = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    expect(account).not.toBeNull();
    if (!account) {
      throw new Error("Expected bootstrap account");
    }
    await repository.createSession({
      id: "session-1",
      companyId: account.company.id,
      userId: account.user.id,
      tokenHash: "token-hash",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      expiresAtIso: "2026-04-10T00:00:00.000Z"
    });
    await repository.createDrawing({
      id: "drawing-1",
      companyId: account.company.id,
      name: "Stored drawing",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: { x: 250, y: 125, scale: 0.3 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: account.user.id,
      updatedByUserId: account.user.id,
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });
    await repository.addAuditLog({
      id: "audit-1",
      companyId: account.company.id,
      actorUserId: account.user.id,
      entityType: "AUTH",
      entityId: account.user.id,
      action: "LOGIN_SUCCEEDED",
      summary: "Login",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await expect(repository.getCompanyById(account.company.id)).resolves.toEqual(account.company);
    await expect(repository.getAuthenticatedSession("token-hash")).resolves.toMatchObject({
      company: account.company,
      user: account.user
    });
    await expect(repository.listDrawings(account.company.id)).resolves.toHaveLength(1);
    await expect(repository.getDrawingById("drawing-1", account.company.id)).resolves.toMatchObject({
      savedViewport: { x: 250, y: 125, scale: 0.3 }
    });
    await expect(repository.listAuditLog(account.company.id)).resolves.toHaveLength(1);
  });

  it("persists immutable quotes in sqlite", async () => {
    const repository = new SqliteAppRepository(join(tmpdir(), `fence-estimator-${randomUUID()}.db`));

    const account = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    expect(account).not.toBeNull();
    if (!account) {
      throw new Error("Expected bootstrap account");
    }

    await repository.createDrawing({
      id: "drawing-1",
      companyId: account.company.id,
      name: "Stored quote drawing",
      customerName: "Cleveland Land Services",
      layout: emptyLayout,
      savedViewport: null,
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: account.user.id,
      updatedByUserId: account.user.id,
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    await repository.createQuote({
      id: "quote-1",
      companyId: account.company.id,
      drawingId: "drawing-1",
      drawingVersionNumber: 1,
      pricedEstimate: {
        drawing: {
          drawingId: "drawing-1",
          drawingName: "Stored quote drawing",
          customerName: "Cleveland Land Services"
        },
        groups: [],
        ancillaryItems: [],
        totals: {
          materialCost: 90,
          labourCost: 30,
          totalCost: 120
        },
        warnings: [],
        pricingSnapshot: {
          updatedAtIso: new Date(0).toISOString(),
          updatedByUserId: null,
          source: "DEFAULT"
        }
      },
      drawingSnapshot: {
        drawingId: "drawing-1",
        drawingName: "Stored quote drawing",
        customerName: "Cleveland Land Services",
        layout: emptyLayout,
        estimate: emptyEstimate,
        schemaVersion: DRAWING_SCHEMA_VERSION,
        rulesVersion: RULES_ENGINE_VERSION,
        versionNumber: 1
      },
      createdByUserId: account.user.id,
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });

    const sqliteQuotes = await repository.listQuotesForDrawing("drawing-1", account.company.id);
    expect(sqliteQuotes).toHaveLength(1);
    expect(sqliteQuotes[0]?.id).toBe("quote-1");
    expect(sqliteQuotes[0]?.drawingVersionNumber).toBe(1);
    expect(sqliteQuotes[0]?.pricedEstimate.totals.totalCost).toBe(120);
  });

  it("supports manager recovery primitives for persisted users", async () => {
    const repository = new SqliteAppRepository(join(tmpdir(), `fence-estimator-${randomUUID()}.db`));

    const account = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    expect(account).not.toBeNull();
    if (!account) {
      throw new Error("Expected bootstrap account");
    }
    await repository.createUser({
      id: "user-2",
      companyId: account.company.id,
      displayName: "John",
      email: "john@example.com",
      role: "ADMIN",
      passwordHash: "hash-2",
      passwordSalt: "salt-2",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });
    await repository.createSession({
      id: "session-2",
      companyId: account.company.id,
      userId: "user-2",
      tokenHash: "token-hash-2",
      createdAtIso: "2026-03-10T02:00:00.000Z",
      expiresAtIso: "2026-04-10T02:00:00.000Z"
    });

    await repository.updateUserPassword("user-2", account.company.id, "hash-3", "salt-3");
    await repository.revokeSessionsForUser("user-2", account.company.id, "2026-03-10T03:00:00.000Z");

    await expect(repository.getUserById("user-2", account.company.id)).resolves.toMatchObject({
      id: "user-2",
      email: "john@example.com"
    });
    await expect(repository.getUserByEmail("john@example.com")).resolves.toMatchObject({
      passwordHash: "hash-3",
      passwordSalt: "salt-3"
    });
    await expect(repository.getAuthenticatedSession("token-hash-2")).resolves.toBeNull();
  });

  it("patches legacy sqlite databases with missing newer columns", async () => {
    const databasePath = join(tmpdir(), `fence-estimator-legacy-${randomUUID()}.db`);
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at_iso TEXT NOT NULL
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at_iso TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at_iso TEXT NOT NULL,
        expires_at_iso TEXT NOT NULL
      );

      CREATE TABLE drawings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        layout_json TEXT NOT NULL,
        estimate_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
    `);
    legacyDatabase
      .prepare("INSERT INTO companies (id, name, created_at_iso) VALUES (?, ?, ?)")
      .run("company-1", "Acme", "2026-03-10T00:00:00.000Z");
    legacyDatabase
      .prepare(
        "INSERT INTO users (id, company_id, email, display_name, role, password_hash, password_salt, created_at_iso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("user-1", "company-1", "jane@example.com", "Jane", "OWNER", "hash", "salt", "2026-03-10T00:00:00.000Z");
    legacyDatabase
      .prepare(
        "INSERT INTO sessions (id, company_id, user_id, token_hash, created_at_iso, expires_at_iso) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("session-1", "company-1", "user-1", "token-hash", "2026-03-10T00:00:00.000Z", "2026-04-10T00:00:00.000Z");
    legacyDatabase
      .prepare(
        "INSERT INTO drawings (id, company_id, name, layout_json, estimate_json, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "drawing-1",
        "company-1",
        "Legacy drawing",
        JSON.stringify(emptyLayout),
        JSON.stringify(emptyEstimate),
        "user-1",
        "user-1",
        "2026-03-10T00:00:00.000Z",
        "2026-03-10T00:00:00.000Z",
      );
    legacyDatabase.close();

    const repository = new SqliteAppRepository(databasePath);

    await expect(repository.getAuthenticatedSession("token-hash")).resolves.toMatchObject({
      company: { id: "company-1" },
      user: { id: "user-1" }
    });
    await expect(repository.listDrawings("company-1")).resolves.toHaveLength(1);
    await expect(repository.listDrawingVersions("drawing-1", "company-1")).resolves.toHaveLength(1);
  });

  it("rejects a second persisted bootstrap attempt", async () => {
    const repository = new SqliteAppRepository(join(tmpdir(), `fence-estimator-${randomUUID()}.db`));

    const firstAccount = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
    const secondAccount = await repository.bootstrapOwnerAccount({
      companyId: "company-2",
      companyName: "Other",
      userId: "user-2",
      displayName: "John",
      email: "john@example.com",
      passwordHash: "hash-2",
      passwordSalt: "salt-2",
      createdAtIso: "2026-03-10T01:00:00.000Z"
    });

    expect(firstAccount).not.toBeNull();
    expect(secondAccount).toBeNull();
    await expect(repository.getUserCount()).resolves.toBe(1);
  });
});
