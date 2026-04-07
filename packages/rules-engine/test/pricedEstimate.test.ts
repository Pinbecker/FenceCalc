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
        spec: { system: "TWIN_BAR", height: "3m", twinBarVariant: "STANDARD" }
      }
    ],
    gates: [],
    basketballPosts: [
      {
        id: "bb-1",
        segmentId: "seg-1",
        offsetMm: 1200,
        facing: "LEFT",
        type: "DEDICATED_POST",
        mountingMode: "PROJECTING_ARM",
        armLengthMm: 1200
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
  return buildDefaultPricingConfig("company-1", updatedByUserId);
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
    expect(result.groups.find((group) => group.key === "height-3000")?.rows.some((row) => row.quantity === 2)).toBe(true);
    expect(result.groups.find((group) => group.key === "height-3000")?.subtotalCost).toBeGreaterThan(0);
    expect(
      result.groups.find((group) => group.key === "floodlight-columns")?.rows.find((row) => row.itemName === "Floodlight columns")?.quantity
    ).toBe(1);
    expect(
      result.groups.flatMap((group) => group.rows).find((row) => row.itemName.toLowerCase().includes("basketball"))?.quantity
    ).toBe(1);
    expect(result.groups.map((group) => group.key)).toContain("commercial");
    expect(result.groups.find((group) => group.key === "ancillary-items")?.rows.find((row) => row.itemCode === null)?.totalCost).toBe(60);
    expect(result.totals.totalCost).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
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
        "UNCLASSIFIED_CORNERS"
      ])
    );
  });

  it("keeps workbook output stable when legacy pricing item codes are missing or inactive", () => {
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

    expect(result.groups.find((group) => group.key === "height-3000")?.rows.some((row) => row.quantity === 2)).toBe(true);
    expect(
      result.groups.find((group) => group.key === "floodlight-columns")?.rows.find((row) => row.itemName === "Floodlight columns")?.quantity
    ).toBe(1);
    expect(result.groups.flatMap((group) => group.rows).some((row) => row.notes?.includes("Pricing item is inactive.") ?? false)).toBe(false);
    expect(result.groups.flatMap((group) => group.rows).some((row) => row.notes?.includes("Pricing item is missing from configuration.") ?? false)).toBe(false);
  });

  it("replaces side-netting support posts instead of adding extra post holes", () => {
    const drawing = buildDrawing({
      segments: [
        {
          id: "seg-net",
          start: { x: 0, y: 0 },
          end: { x: 15150, y: 0 },
          spec: { system: "TWIN_BAR", height: "3m", twinBarVariant: "STANDARD" }
        }
      ],
      sideNettings: [
        {
          id: "net-1",
          segmentId: "seg-net",
          additionalHeightMm: 2000,
          extendedPostInterval: 3
        }
      ]
    });

    const result = buildPricedEstimate(drawing, buildPricingConfig());
    const rows = result.groups.flatMap((group) => group.rows);

    expect(rows.find((row) => row.itemName === "End posts" && row.quantity === 2)?.key).toBe("post:5000:end");
    expect(rows.find((row) => row.itemName === "Intermediate posts" && row.quantity === 1)?.key).toBe("post:5000:intermediate");
    expect(result.workbook?.totals.holeCount).toBe(7);
  });
});
