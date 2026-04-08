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
        spec: { system: "TWIN_BAR" as const, height: "3m" as const, twinBarVariant: "STANDARD" as const }
      }
    ],
    gates: [],
    basketballPosts: [
      {
        id: "bb-1",
        segmentId: "seg-1",
        offsetMm: 1200,
        facing: "LEFT" as const,
        type: "DEDICATED_POST" as const,
        mountingMode: "PROJECTING_ARM" as const,
        armLengthMm: 1200 as const
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
    workspaceId: "workspace-1",
    jobRole: "PRIMARY",
    name: "Court Perimeter",
    customerId: "customer-1",
    customerName: "Town Club",
    layout,
    estimate: estimateDrawingLayout(layout),
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
    versionNumber: 1,
    revisionNumber: 0,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    status: "DRAFT",
    statusChangedAtIso: null,
    statusChangedByUserId: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-15T09:00:00.000Z",
    updatedAtIso: "2026-03-15T09:00:00.000Z"
  };
}

function buildPricingConfig(): PricingConfigRecord {
  return buildDefaultPricingConfig("company-1", "user-1");
}

describe("buildEstimateFromDrawing", () => {
  it("builds a priced estimate from drawing quantities and pricing config", () => {
    const drawing = buildDrawing();
    const pricingConfig = buildPricingConfig();

    const result = buildEstimateFromDrawing(drawing, pricingConfig);
    const panelsGroup = result.groups.find((group) => group.key === "height-3000");
    const floodlightGroup = result.groups.find((group) => group.key === "floodlight-columns");
    const basketballGroup = result.groups.find((group) => group.key === "basketball");

    expect(panelsGroup?.rows.some((row) => row.quantity === 2)).toBe(true);
    expect(panelsGroup?.subtotalCost).toBeGreaterThan(0);
    expect(floodlightGroup?.rows.find((row) => row.itemCode === "MAT_FLOODLIGHT_COLUMN_6000")?.quantity).toBe(1);
    expect(basketballGroup?.rows.find((row) => row.itemCode === "MAT_BASKETBALL_DEDICATED_1200")?.quantity).toBe(1);
    expect(result.groups.map((group) => group.key)).toContain("commercial");
    expect(result.totals.totalCost).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
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
    expect(ancillaryGroup?.rows.find((row) => row.itemCode === null)?.totalCost).toBe(60);
  });

  it("surfaces warnings instead of provisional rows for unsupported pricing paths", () => {
    const drawing: DrawingRecord = {
      ...buildDrawing(),
      layout: {
        ...buildDrawing().layout,
        segments: [
          {
            id: "seg-roll-form",
            start: { x: 0, y: 0 },
            end: { x: 3000, y: 0 },
            spec: { system: "ROLL_FORM", height: "2m" }
          }
        ],
        gates: [
          {
            id: "gate-custom",
            segmentId: "seg-roll-form",
            startOffsetMm: 500,
            endOffsetMm: 1700,
            gateType: "CUSTOM"
          }
        ],
        basketballPosts: [],
        floodlightColumns: []
      }
    };
    drawing.estimate = estimateDrawingLayout(drawing.layout);

    const result = buildEstimateFromDrawing(drawing, buildPricingConfig());

    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_FENCE_SYSTEM", "CUSTOM_GATES"])
    );
    expect(result.groups.find((group) => group.key === "fixings")).toBeUndefined();
    expect(result.groups.find((group) => group.key === "gates")).toBeUndefined();
  });

  it("flags junction and unclassified corner counts for manual review", () => {
    const baseDrawing = buildDrawing();
    const drawing: DrawingRecord = {
      ...baseDrawing,
      estimate: {
        ...baseDrawing.estimate,
        posts: {
          ...baseDrawing.estimate.posts,
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
          ...baseDrawing.estimate.corners,
          total: 1,
          unclassified: 1
        }
      }
    };

    const result = buildEstimateFromDrawing(drawing, buildPricingConfig());

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INLINE_JOIN_OR_JUNCTION_POSTS" }),
        expect.objectContaining({ code: "UNCLASSIFIED_CORNERS" })
      ])
    );
  });
});
