import { describe, expect, it } from "vitest";

import type { DrawingRecord, PricingConfigRecord } from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";
import { estimateDrawingLayout } from "@fence-estimator/rules-engine";

import { buildEstimateFromDrawing } from "./buildEstimateFromDrawing.js";

function buildDrawing(): DrawingRecord {
  const layout = {
    segments: [
      {
        id: "seg-1",
        start: { x: 0, y: 0 },
        end: { x: 5050, y: 0 },
        spec: { system: "TWIN_BAR" as const, height: "2m" as const, twinBarVariant: "STANDARD" as const }
      }
    ],
    gates: [],
    basketballPosts: [
      {
        id: "bb-1",
        segmentId: "seg-1",
        offsetMm: 1200,
        facing: "LEFT" as const
      }
    ],
    floodlightColumns: [
      {
        id: "fc-1",
        segmentId: "seg-1",
        offsetMm: 3200,
        facing: "RIGHT" as const
      }
    ]
  };

  return {
    id: "drawing-1",
    companyId: "company-1",
    name: "Court Perimeter",
    customerName: "Town Club",
    layout,
    estimate: estimateDrawingLayout(layout),
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
    versionNumber: 1,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-15T09:00:00.000Z",
    updatedAtIso: "2026-03-15T09:00:00.000Z"
  };
}

function buildPricingConfig(): PricingConfigRecord {
  const config = buildDefaultPricingConfig("company-1", "user-1");
  const costByCode: Record<string, { materialCost: number; labourCost: number }> = {
    TWIN_BAR_PANEL_2M: { materialCost: 10, labourCost: 2 },
    TWIN_BAR_POST_INTERMEDIATE: { materialCost: 5, labourCost: 1 },
    TWIN_BAR_POST_END: { materialCost: 6, labourCost: 1 },
    TWIN_BAR_POST_CORNER_INTERNAL: { materialCost: 7, labourCost: 1 },
    TWIN_BAR_POST_CORNER_EXTERNAL: { materialCost: 8, labourCost: 1 },
    TWIN_BAR_FENCE_CONCRETE: { materialCost: 100, labourCost: 0 },
    TWIN_BAR_FLOODLIGHT_COLUMN: { materialCost: 200, labourCost: 20 },
    TWIN_BAR_FLOODLIGHT_COLUMN_CONCRETE: { materialCost: 120, labourCost: 0 },
    TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS: { materialCost: 3, labourCost: 0 },
    TWIN_BAR_FLOODLIGHT_COLUMN_CHEMFIX: { materialCost: 8, labourCost: 0 },
    TWIN_BAR_BASKETBALL_POST: { materialCost: 150, labourCost: 10 },
    TWIN_BAR_BASKETBALL_POST_CONCRETE: { materialCost: 110, labourCost: 0 },
    TWIN_BAR_GENERAL_PLANT: { materialCost: 700, labourCost: 0 }
  };

  return {
    ...config,
    items: config.items.map((item) => ({
      ...item,
      ...(costByCode[item.itemCode] ?? {})
    }))
  };
}

describe("buildEstimateFromDrawing", () => {
  it("builds a priced estimate from drawing quantities and pricing config", () => {
    const drawing = buildDrawing();
    const pricingConfig = buildPricingConfig();

    const result = buildEstimateFromDrawing(drawing, pricingConfig);
    const panelsGroup = result.groups.find((group) => group.key === "panels");
    const postsGroup = result.groups.find((group) => group.key === "posts");
    const concreteGroup = result.groups.find((group) => group.key === "concrete");
    const floodlightGroup = result.groups.find((group) => group.key === "floodlight-columns");
    const basketballGroup = result.groups.find((group) => group.key === "basketball-posts");

    expect(panelsGroup?.rows[0]?.quantity).toBe(2);
    expect(panelsGroup?.rows[0]?.totalCost).toBe(24);

    expect(postsGroup?.rows.find((row) => row.itemCode === "TWIN_BAR_POST_END")?.quantity).toBe(2);
    expect(postsGroup?.rows.find((row) => row.itemCode === "TWIN_BAR_POST_INTERMEDIATE")?.quantity).toBe(1);

    expect(concreteGroup?.rows[0]?.quantity).toBeCloseTo(0.229, 3);
    expect(floodlightGroup?.rows.find((row) => row.itemCode === "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS")?.quantity).toBe(4);
    expect(floodlightGroup?.rows.find((row) => row.itemCode === "TWIN_BAR_FLOODLIGHT_COLUMN_CHEMFIX")?.quantity).toBe(8);
    expect(basketballGroup?.rows.find((row) => row.itemCode === "TWIN_BAR_BASKETBALL_POST")?.quantity).toBe(1);
    expect(result.totals.totalCost).toBeGreaterThan(0);
  });

  it("adds ancillary items into the ancillary group", () => {
    const drawing = buildDrawing();
    const pricingConfig = buildPricingConfig();

    const result = buildEstimateFromDrawing(drawing, pricingConfig, [
      {
        id: "anc-1",
        description: "Site signage",
        quantity: 2,
        materialCost: 25,
        labourCost: 5
      }
    ]);

    const ancillaryGroup = result.groups.find((group) => group.key === "ancillary-items");
    expect(ancillaryGroup?.rows).toHaveLength(1);
    expect(ancillaryGroup?.rows[0]?.totalCost).toBe(60);
  });
});
