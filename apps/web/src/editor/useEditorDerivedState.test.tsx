import type { GatePlacement, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import { defaultFenceSpec, ROLL_FORM_HEIGHT_OPTIONS, TWIN_BAR_HEIGHT_OPTIONS } from "./constants.js";
import { useEditorDerivedState } from "./useEditorDerivedState.js";
import { renderHookServer } from "../test/renderHookServer.js";

function buildRectangleSegments(): LayoutSegment[] {
  const spec = defaultFenceSpec();
  return [
    { id: "s1", start: { x: 0, y: 0 }, end: { x: 7200, y: 0 }, spec },
    { id: "s2", start: { x: 7200, y: 0 }, end: { x: 7200, y: 3600 }, spec },
    { id: "s3", start: { x: 7200, y: 3600 }, end: { x: 0, y: 3600 }, spec },
    { id: "s4", start: { x: 0, y: 3600 }, end: { x: 0, y: 0 }, spec }
  ];
}

describe("useEditorDerivedState", () => {
  it("builds editor summaries, connectivity, and selected optimization visuals", () => {
    const segments = buildRectangleSegments();
    const gatePlacements: GatePlacement[] = [
      {
        id: "g1",
        segmentId: "s1",
        startOffsetMm: 1600,
        endOffsetMm: 2800,
        gateType: "SINGLE_LEAF"
      }
    ];

    const initial = renderHookServer(() =>
      useEditorDerivedState({
        segments,
        gatePlacements,
        basketballPostPlacements: [],
        selectedSegmentId: "s1",
        selectedPlanId: null,
        activeSpecSystem: "TWIN_BAR",
        viewScale: 0.2,
        canvasWidth: 960
      })
    );

    const selectedPlanId = initial.highlightableOptimizationPlans[0]?.id ?? null;
    const result = renderHookServer(() =>
      useEditorDerivedState({
        segments,
        gatePlacements,
        basketballPostPlacements: [],
        selectedSegmentId: "s1",
        selectedPlanId,
        activeSpecSystem: "TWIN_BAR",
        viewScale: 0.2,
        canvasWidth: 960
      })
    );

    expect(result.selectedSegment?.id).toBe("s1");
    expect(result.selectedComponentClosed).toBe(true);
    expect(result.resolvedGateById.get("g1")?.segmentId).toBe("s1");
    expect(result.gatesBySegmentId.get("s1")).toHaveLength(1);
    expect(result.estimateSegments.length).toBeGreaterThan(segments.length);
    expect(result.visualPosts.length).toBeGreaterThan(0);
    expect(result.drawAnchorNodes.length).toBeGreaterThan(0);
    expect(result.postTypeCounts.GATE).toBeGreaterThan(0);
    expect(result.segmentLengthLabelsBySegmentId.get("s1")?.length).toBeGreaterThan(0);
    expect(result.visibleSegmentLabelKeys.size).toBeGreaterThan(0);
    expect(result.scaleBar.lengthPx).toBeGreaterThan(0);
    expect(result.activeHeightOptions).toEqual(TWIN_BAR_HEIGHT_OPTIONS);
    expect(result.editorSummary.gateCounts.total).toBeGreaterThan(0);
    expect(result.segmentOrdinalById.get(result.estimateSegments[0]!.id)).toBe(1);
    expect(result.highlightableOptimizationPlans.length).toBeGreaterThan(0);
    expect(result.selectedPlanVisual?.plan.id).toBe(selectedPlanId);
  });

  it("returns roll-form height options and clears selections when no segment is selected", () => {
    const result = renderHookServer(() =>
      useEditorDerivedState({
        segments: [
          {
            id: "roll-segment",
            start: { x: 0, y: 0 },
            end: { x: 3000, y: 0 },
            spec: {
              ...defaultFenceSpec(),
              system: "ROLL_FORM"
            }
          }
        ],
        gatePlacements: [],
        basketballPostPlacements: [],
        selectedSegmentId: null,
        selectedPlanId: null,
        activeSpecSystem: "ROLL_FORM",
        viewScale: 1,
        canvasWidth: 640
      })
    );

    expect(result.selectedSegment).toBeNull();
    expect(result.selectedComponentClosed).toBe(false);
    expect(result.activeHeightOptions).toEqual(ROLL_FORM_HEIGHT_OPTIONS);
    expect(result.selectedPlanVisual).toBeNull();
  });
});
