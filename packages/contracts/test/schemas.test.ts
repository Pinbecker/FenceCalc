import { describe, expect, it } from "vitest";

import {
  bootstrapOwnerRequestSchema,
  drawingArchiveRequestSchema,
  drawingCreateRequestSchema,
  drawingUpdateRequestSchema,
  estimateSnapshotRequestSchema,
  fenceSpecSchema,
  layoutModelSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  quoteCreateRequestSchema,
  quoteRecordSchema,
  userPasswordSetRequestSchema,
  userCreateRequestSchema
} from "../src/schemas.js";

describe("contracts schemas", () => {
  it("rejects roll-form fence heights that are not supported by the system", () => {
    const result = fenceSpecSchema.safeParse({
      system: "ROLL_FORM",
      height: "4m"
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.message).toContain("Unsupported roll form height");
  });

  it("accepts a valid layout payload", () => {
    const result = layoutModelSchema.safeParse({
      segments: [
        {
          id: "one",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: {
            system: "TWIN_BAR",
            height: "2m",
            twinBarVariant: "STANDARD"
          }
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate or overlapping gate definitions", () => {
    const result = layoutModelSchema.safeParse({
      segments: [
        {
          id: "one",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: {
            system: "TWIN_BAR",
            height: "2m",
            twinBarVariant: "STANDARD"
          }
        }
      ],
      gates: [
        {
          id: "gate-1",
          segmentId: "one",
          startOffsetMm: 1000,
          endOffsetMm: 2500,
          gateType: "SINGLE_LEAF"
        },
        {
          id: "gate-2",
          segmentId: "one",
          startOffsetMm: 2000,
          endOffsetMm: 3000,
          gateType: "DOUBLE_LEAF"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects gates that reference missing segments", () => {
    const result = layoutModelSchema.safeParse({
      segments: [],
      gates: [
        {
          id: "gate-1",
          segmentId: "missing",
          startOffsetMm: 1000,
          endOffsetMm: 2000,
          gateType: "SINGLE_LEAF"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("requires snapshot requests to be wrapped in a layout object", () => {
    const result = estimateSnapshotRequestSchema.safeParse({
      segments: []
    });

    expect(result.success).toBe(false);
  });

  it("normalizes emails for auth payloads", () => {
    const result = loginRequestSchema.parse({
      email: "Jane@Example.com",
      password: "supersecure123"
    });

    expect(result.email).toBe("jane@example.com");
  });

  it("requires company registration details", () => {
    const result = bootstrapOwnerRequestSchema.safeParse({
      companyName: "A",
      displayName: "JD",
      email: "bad",
      password: "short"
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty drawing updates", () => {
    const result = drawingUpdateRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("requires drawing updates to include an expected version number", () => {
    const result = drawingUpdateRequestSchema.safeParse({
      name: "Main yard"
    });

    expect(result.success).toBe(false);
  });

  it("defaults missing gate lists on drawing payloads", () => {
    const result = drawingCreateRequestSchema.parse({
      name: "Main yard",
      customerName: "Cleveland Land Services",
      layout: {
        segments: []
      }
    });

    expect(result.layout.gates).toEqual([]);
    expect(result.layout.basketballPosts).toEqual([]);
    expect(result.layout.floodlightColumns).toEqual([]);
  });

  it("rejects basketball posts that reference missing segments", () => {
    const result = layoutModelSchema.safeParse({
      segments: [],
      basketballPosts: [
        {
          id: "post-1",
          segmentId: "missing",
          offsetMm: 1000,
          facing: "LEFT"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects floodlight columns that reference missing segments", () => {
    const result = layoutModelSchema.safeParse({
      segments: [],
      floodlightColumns: [
        {
          id: "column-1",
          segmentId: "missing",
          offsetMm: 1000,
          facing: "LEFT"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects owner role creation through the admin user schema", () => {
    const result = userCreateRequestSchema.safeParse({
      displayName: "Jane Doe",
      email: "jane@example.com",
      password: "supersecure123",
      role: "OWNER"
    });

    expect(result.success).toBe(false);
  });

  it("requires a strong password for manager-set password recovery", () => {
    expect(
      userPasswordSetRequestSchema.safeParse({
        password: "supersecure123"
      }).success,
    ).toBe(true);
    expect(
      userPasswordSetRequestSchema.safeParse({
        password: "short"
      }).success,
    ).toBe(false);
  });

  it("accepts drawing archive payloads", () => {
    const result = drawingArchiveRequestSchema.safeParse({ archived: true, expectedVersionNumber: 3 });

    expect(result.success).toBe(true);
  });

  it("requires reset token and password for password resets", () => {
    expect(
      passwordResetRequestSchema.safeParse({
        email: "jane@example.com"
      }).success,
    ).toBe(true);
    expect(
      passwordResetConfirmSchema.safeParse({
        token: "too-short",
        password: "supersecure123"
      }).success,
    ).toBe(false);
  });

  it("defaults quote ancillary items and validates immutable quote records", () => {
    const createResult = quoteCreateRequestSchema.parse({});
    expect(createResult.ancillaryItems).toEqual([]);

    const recordResult = quoteRecordSchema.safeParse({
      id: "quote-1",
      companyId: "company-1",
      drawingId: "drawing-1",
      drawingVersionNumber: 3,
      pricedEstimate: {
        drawing: {
          drawingId: "drawing-1",
          drawingName: "Main yard",
          customerName: "Cleveland Land Services"
        },
        groups: [],
        ancillaryItems: [],
        totals: {
          materialCost: 100,
          labourCost: 25,
          totalCost: 125
        },
        warnings: [],
        pricingSnapshot: {
          updatedAtIso: "1970-01-01T00:00:00.000Z",
          updatedByUserId: null,
          source: "DEFAULT"
        }
      },
      drawingSnapshot: {
        drawingId: "drawing-1",
        drawingName: "Main yard",
        customerName: "Cleveland Land Services",
        layout: {
          segments: [],
          gates: [],
          basketballPosts: [],
          floodlightColumns: []
        },
        estimate: {
          posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
          corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
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
        },
        schemaVersion: 1,
        rulesVersion: "2026-03-11",
        versionNumber: 3
      },
      createdByUserId: "user-1",
      createdAtIso: "2026-03-12T12:00:00.000Z"
    });

    expect(recordResult.success).toBe(true);
  });
});
