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
const TEST_CUSTOMER_ID = "customer-1";
const TEST_CUSTOMER_NAME = "Cleveland Land Services";

const featureRichLayout: LayoutModel = {
  segments: [
    {
      id: "s1",
      start: { x: 0, y: 0 },
      end: { x: 12000, y: 0 },
      spec: { system: "TWIN_BAR", height: "3m" }
    },
    {
      id: "s2",
      start: { x: 0, y: 8000 },
      end: { x: 12000, y: 8000 },
      spec: { system: "TWIN_BAR", height: "3m" }
    }
  ],
  gates: [],
  basketballFeatures: [
    {
      id: "bf-1",
      segmentId: "s1",
      offsetMm: 2525,
      facing: "LEFT",
      type: "MOUNTED_TO_EXISTING_POST",
      mountingMode: "POST_MOUNTED"
    }
  ],
  basketballPosts: [
    {
      id: "bp-1",
      segmentId: "s1",
      offsetMm: 5050,
      facing: "RIGHT",
      type: "DEDICATED_POST",
      mountingMode: "PROJECTING_ARM",
      armLengthMm: 1800,
      replacesIntermediatePost: true
    }
  ],
  floodlightColumns: [
    {
      id: "fc-1",
      segmentId: "s1",
      offsetMm: 3000,
      facing: "LEFT"
    }
  ],
  goalUnits: [
    {
      id: "goal-1",
      segmentId: "s1",
      centerOffsetMm: 6000,
      side: "LEFT",
      widthMm: 3000,
      depthMm: 1200,
      goalHeightMm: 3000
    }
  ],
  kickboards: [
    {
      id: "kick-1",
      segmentId: "s1",
      sectionHeightMm: 225,
      thicknessMm: 50,
      profile: "CHAMFERED",
      boardLengthMm: 2500
    }
  ],
  pitchDividers: [
    {
      id: "divider-1",
      startAnchor: { segmentId: "s1", offsetMm: 2500 },
      endAnchor: { segmentId: "s2", offsetMm: 8500 }
    }
  ],
  sideNettings: [
    {
      id: "net-1",
      segmentId: "s2",
      additionalHeightMm: 2000,
      startOffsetMm: 2525,
      endOffsetMm: 7575,
      extendedPostInterval: 3
    }
  ]
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

async function createTestCustomer(
  repository: InMemoryAppRepository | SqliteAppRepository,
  companyId: string,
  userId: string,
) {
  return repository.createCustomer({
    id: TEST_CUSTOMER_ID,
    companyId,
    name: TEST_CUSTOMER_NAME,
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    additionalContacts: [],
    siteAddress: "",
    notes: "",
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAtIso: "2026-03-10T00:00:00.000Z",
    updatedAtIso: "2026-03-10T00:00:00.000Z"
  });
}

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
    await createTestCustomer(repository, "company-1", "user-1");

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Initial",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
      expectedVersionNumber: 1,
      name: "Updated",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
    await createTestCustomer(repository, "company-1", "user-1");

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Quoted drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
          customerId: TEST_CUSTOMER_ID,
          customerName: TEST_CUSTOMER_NAME
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
        customerId: TEST_CUSTOMER_ID,
        customerName: TEST_CUSTOMER_NAME,
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
    await createTestCustomer(repository, "company-1", "user-1");
    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Initial",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
      expectedVersionNumber: 1,
      name: "Updated",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
      expectedVersionNumber: 2,
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
      expectedVersionNumber: 3,
      versionNumber: 1,
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      restoredByUserId: "user-1",
      restoredAtIso: "2026-03-13T00:00:00.000Z"
    });

    expect(restored?.versionNumber).toBe(4);
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
    await createTestCustomer(repository, account.company.id, account.user.id);
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
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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

  it("round-trips full feature layouts from sqlite storage", async () => {
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
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: account.company.id,
      name: "Feature drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: featureRichLayout,
      savedViewport: { x: 250, y: 125, scale: 0.3 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: account.user.id,
      updatedByUserId: account.user.id,
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    await expect(repository.getDrawingById("drawing-1", account.company.id)).resolves.toMatchObject({
      layout: {
        basketballFeatures: [{ id: "bf-1" }],
        basketballPosts: [{ id: "bp-1" }],
        floodlightColumns: [{ id: "fc-1" }],
        goalUnits: [{ id: "goal-1" }],
        kickboards: [{ id: "kick-1" }],
        pitchDividers: [{ id: "divider-1" }],
        sideNettings: [{ id: "net-1" }]
      }
    });

    await expect(repository.listDrawings(account.company.id)).resolves.toMatchObject([
      {
        previewLayout: {
          goalUnits: [{ id: "goal-1" }],
          kickboards: [{ id: "kick-1" }],
          pitchDividers: [{ id: "divider-1" }],
          sideNettings: [{ id: "net-1" }]
        }
      }
    ]);
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
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: account.company.id,
      name: "Stored quote drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
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
          customerId: TEST_CUSTOMER_ID,
          customerName: TEST_CUSTOMER_NAME
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
        customerId: TEST_CUSTOMER_ID,
        customerName: TEST_CUSTOMER_NAME,
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

  it("returns null when updateDrawing has a stale version number", async () => {
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
    if (!account) throw new Error("Expected bootstrap account");
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Original",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    // First update succeeds with correct version
    const updated = await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      expectedVersionNumber: 1,
      name: "Updated",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });
    expect(updated).not.toBeNull();
    expect(updated?.versionNumber).toBe(2);

    // Second update with stale version 1 returns null (conflict)
    const conflict = await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      expectedVersionNumber: 1,
      name: "Stale update",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-12T00:00:00.000Z"
    });
    expect(conflict).toBeNull();

    // Drawing still has version 2 with the first update's name
    const drawing = await repository.getDrawingById("drawing-1", "company-1");
    expect(drawing?.versionNumber).toBe(2);
    expect(drawing?.name).toBe("Updated");
  });

  it("returns null when setDrawingArchivedState has a stale version number", async () => {
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
    if (!account) throw new Error("Expected bootstrap account");
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    // Stale version number returns null
    const conflict = await repository.setDrawingArchivedState({
      drawingId: "drawing-1",
      companyId: "company-1",
      expectedVersionNumber: 999,
      archived: true,
      archivedAtIso: "2026-03-11T00:00:00.000Z",
      archivedByUserId: "user-1",
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });
    expect(conflict).toBeNull();

    // Drawing is still not archived
    const drawing = await repository.getDrawingById("drawing-1", "company-1");
    expect(drawing?.isArchived).toBe(false);
  });

  it("returns null when restoreDrawingVersion has a stale version number", async () => {
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
    if (!account) throw new Error("Expected bootstrap account");
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    // Update to create version 2
    await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      expectedVersionNumber: 1,
      name: "V2",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });

    // Restore with stale version returns null
    const conflict = await repository.restoreDrawingVersion({
      drawingId: "drawing-1",
      companyId: "company-1",
      expectedVersionNumber: 1,
      versionNumber: 1,
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      restoredByUserId: "user-1",
      restoredAtIso: "2026-03-12T00:00:00.000Z"
    });
    expect(conflict).toBeNull();

    // Drawing still at version 2
    const drawing = await repository.getDrawingById("drawing-1", "company-1");
    expect(drawing?.versionNumber).toBe(2);
    expect(drawing?.name).toBe("V2");
  });

  it("rolls back all changes in a transaction on error", async () => {
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
    if (!account) throw new Error("Expected bootstrap account");
    await createTestCustomer(repository, account.company.id, account.user.id);

    await repository.createDrawing({
      id: "drawing-1",
      companyId: "company-1",
      name: "Drawing",
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      layout: emptyLayout,
      savedViewport: { x: 0, y: 0, scale: 1 },
      estimate: emptyEstimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    // Transaction that succeeds partially then throws
    await expect(
      repository.runInTransaction(async () => {
        await repository.setDrawingArchivedState({
          drawingId: "drawing-1",
          companyId: "company-1",
          expectedVersionNumber: 1,
          archived: true,
          archivedAtIso: "2026-03-11T00:00:00.000Z",
          archivedByUserId: "user-1",
          updatedByUserId: "user-1",
          updatedAtIso: "2026-03-11T00:00:00.000Z"
        });
        throw new Error("Simulated failure");
      }),
    ).rejects.toThrow("Simulated failure");

    // Archive was rolled back
    const drawing = await repository.getDrawingById("drawing-1", "company-1");
    expect(drawing?.isArchived).toBe(false);
    expect(drawing?.versionNumber).toBe(1);
  });
});
