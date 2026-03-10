import { describe, expect, it } from "vitest";

import type { EstimateSnapshot } from "@fence-estimator/contracts";

import { InMemorySnapshotRepository } from "./repository.js";

function buildSnapshot(id: string): EstimateSnapshot {
  return {
    id,
    createdAtIso: "2026-03-10T00:00:00.000Z",
    layout: {
      segments: []
    },
    estimate: {
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
    }
  };
}

describe("InMemorySnapshotRepository", () => {
  it("stores and retrieves snapshots by id", async () => {
    const repository = new InMemorySnapshotRepository();
    const snapshot = buildSnapshot("snapshot-1");

    await repository.create(snapshot);

    await expect(repository.getById("snapshot-1")).resolves.toEqual(snapshot);
  });

  it("returns null for missing snapshots", async () => {
    const repository = new InMemorySnapshotRepository();

    await expect(repository.getById("missing")).resolves.toBeNull();
  });
});
