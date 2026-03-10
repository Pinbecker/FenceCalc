import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { EstimateResult, LayoutModel } from "@fence-estimator/contracts";

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

    await repository.createOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });

    await expect(repository.getUserByEmail("jane@example.com")).resolves.toMatchObject({
      id: "user-1",
      companyId: "company-1"
    });
  });

  it("stores and updates drawings per company", async () => {
    const repository = new InMemoryAppRepository();
    await repository.createOwnerAccount({
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
      layout: emptyLayout,
      estimate: emptyEstimate,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    const drawings = await repository.listDrawings("company-1");
    expect(drawings).toHaveLength(1);

    const updated = await repository.updateDrawing({
      drawingId: "drawing-1",
      companyId: "company-1",
      name: "Updated",
      layout: emptyLayout,
      estimate: emptyEstimate,
      updatedByUserId: "user-1",
      updatedAtIso: "2026-03-11T00:00:00.000Z"
    });

    expect(updated?.name).toBe("Updated");
  });
});

describe("SqliteAppRepository", () => {
  it("persists accounts, sessions, and drawings", async () => {
    const repository = new SqliteAppRepository(join(tmpdir(), `fence-estimator-${randomUUID()}.db`));

    const account = await repository.createOwnerAccount({
      companyId: "company-1",
      companyName: "Acme",
      userId: "user-1",
      displayName: "Jane",
      email: "jane@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-03-10T00:00:00.000Z"
    });
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
      layout: emptyLayout,
      estimate: emptyEstimate,
      createdByUserId: account.user.id,
      updatedByUserId: account.user.id,
      createdAtIso: "2026-03-10T00:00:00.000Z",
      updatedAtIso: "2026-03-10T00:00:00.000Z"
    });

    await expect(repository.getCompanyById(account.company.id)).resolves.toEqual(account.company);
    await expect(repository.getAuthenticatedSession("token-hash")).resolves.toMatchObject({
      company: account.company,
      user: account.user
    });
    await expect(repository.listDrawings(account.company.id)).resolves.toHaveLength(1);
  });
});
