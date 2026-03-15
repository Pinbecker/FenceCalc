import { describe, expect, it } from "vitest";

import type { DrawingRecord, LayoutModel, PricingConfigRecord } from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";

import {
  BASKETBALL_POST_BASE_MM,
  FLOODLIGHT_COLUMN_BASE_MM,
  buildPricedEstimate,
  calculateConcreteVolumeFromDimensionsMm,
  calculateFenceConcreteVolumeM3,
  calculateFloodlightConsumables,
  estimateDrawingLayout,
  getConcreteRuleForHeight,
  getFenceHeightKeyForMm
} from "../src/index.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-15";

function buildDrawing(layout: LayoutModel): DrawingRecord {
  return {
    id: "drawing-1",
    companyId: "company-1",
    name: "Court Perimeter",
    customerName: "Town Club",
    layout,
    estimate: estimateDrawingLayout(layout),
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
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

function buildTwinBarDrawing(): DrawingRecord {
  return buildDrawing({
    segments: [
      {
        id: "seg-1",
        start: { x: 0, y: 0 },
        end: { x: 5050, y: 0 },
        spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
      }
    ],
    gates: [],
    basketballPosts: [
      {
        id: "bb-1",
        segmentId: "seg-1",
        offsetMm: 1200,
        facing: "LEFT"
      }
    ],
    floodlightColumns: [
      {
        id: "fc-1",
        segmentId: "seg-1",
        offsetMm: 3200,
        facing: "RIGHT"
      }
    ]
  });
}

function buildPricingConfig(updatedByUserId: string | null = "user-1"): PricingConfigRecord {
  const config = buildDefaultPricingConfig("company-1", updatedByUserId);
  const costByCode: Record<string, { materialCost: number; labourCost: number }> = {
    TWIN_BAR_PANEL_2M: { materialCost: 10, labourCost: 2 },
    TWIN_BAR_POST_INTERMEDIATE: { materialCost: 5, labourCost: 1 },
    TWIN_BAR_POST_END: { materialCost: 6, labourCost: 1 },
    TWIN_BAR_POST_CORNER_INTERNAL: { materialCost: 7, labourCost: 1 },
    TWIN_BAR_POST_CORNER_EXTERNAL: { materialCost: 8, labourCost: 1 },
    TWIN_BAR_GATE_SINGLE_LEAF_LEAF: { materialCost: 30, labourCost: 5 },
    TWIN_BAR_GATE_SINGLE_LEAF_POSTS: { materialCost: 12, labourCost: 2 },
    TWIN_BAR_GATE_DOUBLE_LEAF_LEAVES: { materialCost: 35, labourCost: 6 },
    TWIN_BAR_GATE_DOUBLE_LEAF_POSTS: { materialCost: 16, labourCost: 3 },
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

describe("concretePricing", () => {
  it("maps fence heights and calculates concrete and consumables", () => {
    expect(getConcreteRuleForHeight("2m")).toEqual({ heightKey: "2m", depthMm: 850, widthMm: 300, lengthMm: 300 });
    expect(getFenceHeightKeyForMm(2000)).toBe("2m");
    expect(getFenceHeightKeyForMm(1999)).toBeNull();
    expect(calculateConcreteVolumeFromDimensionsMm(FLOODLIGHT_COLUMN_BASE_MM)).toBeCloseTo(0.528125, 6);
    expect(calculateConcreteVolumeFromDimensionsMm(BASKETBALL_POST_BASE_MM)).toBeCloseTo(0.1225, 6);
    expect(calculateFenceConcreteVolumeM3({ 2000: 3, 2400: 2, 1999: 4, 3000: 0 })).toBeCloseTo(0.43775, 6);
    expect(calculateFloodlightConsumables(2)).toEqual({ bolts: 8, chemfixTubes: 12 });
    expect(calculateFloodlightConsumables(0)).toEqual({ bolts: 0, chemfixTubes: 0 });
  });
});

describe("buildPricedEstimate", () => {
  it("builds priced groups, totals, ancillary items, and company-config snapshot metadata", () => {
    const result = buildPricedEstimate(buildTwinBarDrawing(), buildPricingConfig(), [
      {
        id: "anc-1",
        description: "Site signage",
        quantity: 2,
        materialCost: 25,
        labourCost: 5
      }
    ]);

    expect(result.pricingSnapshot.source).toBe("COMPANY_CONFIG");
    expect(result.groups.find((group) => group.key === "panels")?.rows[0]?.quantity).toBe(2);
    expect(result.groups.find((group) => group.key === "posts")?.rows.find((row) => row.itemCode === "TWIN_BAR_POST_END")?.quantity).toBe(2);
    expect(result.groups.find((group) => group.key === "concrete")?.rows[0]?.quantity).toBeCloseTo(0.229, 3);
    expect(
      result.groups.find((group) => group.key === "floodlight-columns")?.rows.find((row) => row.itemCode === "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS")?.quantity
    ).toBe(4);
    expect(
      result.groups.find((group) => group.key === "basketball-posts")?.rows.find((row) => row.itemCode === "TWIN_BAR_BASKETBALL_POST")?.quantity
    ).toBe(1);
    expect(result.groups.find((group) => group.key === "ancillary-items")?.rows[0]?.totalCost).toBe(60);
    expect(result.totals.totalCost).toBeGreaterThan(0);
    expect(result.warnings.map((warning) => warning.code)).toContain("FIXINGS_EXCLUDED");
  });

  it("surfaces unsupported-system/manual-review warnings and default pricing snapshots", () => {
    const drawing = buildDrawing({
      segments: [
        {
          id: "seg-roll",
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
          spec: { system: "ROLL_FORM", height: "2m" }
        }
      ],
      gates: [
        {
          id: "gate-1",
          segmentId: "seg-roll",
          startOffsetMm: 500,
          endOffsetMm: 1700,
          gateType: "CUSTOM"
        }
      ],
      basketballPosts: [],
      floodlightColumns: []
    });

    drawing.estimate = {
      ...drawing.estimate,
      posts: {
        ...drawing.estimate.posts,
        total: 6,
        byHeightAndType: {
          "2000": {
            end: 2,
            intermediate: 1,
            corner: 0,
            junction: 1,
            inlineJoin: 2,
            total: 6
          }
        }
      },
      corners: {
        ...drawing.estimate.corners,
        total: 1,
        unclassified: 1
      }
    };

    const result = buildPricedEstimate(drawing, buildPricingConfig(null));

    expect(result.pricingSnapshot.source).toBe("DEFAULT");
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "UNSUPPORTED_FENCE_SYSTEM",
        "CUSTOM_GATES",
        "INLINE_JOIN_OR_JUNCTION_POSTS",
        "UNCLASSIFIED_CORNERS",
        "FIXINGS_EXCLUDED"
      ])
    );
  });

  it("adds pricing notes when items are missing or inactive", () => {
    const drawing = buildTwinBarDrawing();
    const pricingConfig = buildPricingConfig();
    const result = buildPricedEstimate(drawing, {
      ...pricingConfig,
      items: pricingConfig.items
        .filter((item) => item.itemCode !== "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS")
        .map((item) =>
          item.itemCode === "TWIN_BAR_POST_INTERMEDIATE"
            ? {
                ...item,
                isActive: false
              }
            : item
        )
    });

    expect(
      result.groups.find((group) => group.key === "posts")?.rows.find((row) => row.itemCode === "TWIN_BAR_POST_INTERMEDIATE")?.notes
    ).toContain("Pricing item is inactive.");
    expect(
      result.groups.find((group) => group.key === "floodlight-columns")?.rows.find((row) => row.itemCode === "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS")?.notes
    ).toContain("Pricing item is missing from configuration.");
  });
});
