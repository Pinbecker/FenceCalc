import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";
import type { ResolvedBasketballPostPlacement, ResolvedFloodlightColumnPlacement } from "./editor/types.js";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";

import { buildOptimization3DScene } from "./optimization3D.js";

describe("buildOptimization3DScene", () => {
  it("places upper-lift cut overlays on the correct height band", () => {
    const segment: LayoutSegment = {
      id: "seg-4m",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "4m", twinBarVariant: "STANDARD" }
    };
    const plan: TwinBarOptimizationPlan = {
      id: "plan-top-lift",
      variant: "STANDARD",
      stockPanelHeightMm: 1000,
      stockPanelWidthMm: 2525,
      consumedMm: 900,
      leftoverMm: 125,
      reusableLeftoverMm: 0,
      reusedCuts: 0,
      panelsSaved: 1,
      cuts: [
        {
          id: "cut-top",
          step: 1,
          mode: "OPEN_STOCK_PANEL",
          demand: { segmentId: "seg-4m", startOffsetMm: 0, endOffsetMm: 900, lengthMm: 900 },
          lengthMm: 900,
          effectiveLengthMm: 1100,
          offcutBeforeMm: 2525,
          offcutAfterMm: 1625
        }
      ]
    };

    const scene = buildOptimization3DScene([segment], [plan], new Map([["seg-4m", 4]]));

    expect(scene.cutOverlays).toHaveLength(1);
    expect(scene.cutOverlays[0]?.baseHeightMm).toBe(3000);
  });

  it("creates a dedicated super-rebound lower mesh zone", () => {
    const segment: LayoutSegment = {
      id: "seg-sr",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2.4m", twinBarVariant: "SUPER_REBOUND" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map());
    const reboundSlices = scene.panelSlices.filter((slice) => slice.tone === "REBOUND");

    expect(reboundSlices.length).toBeGreaterThan(0);
    expect(reboundSlices[0]?.apertureHeightMm).toBe(66);
    expect(reboundSlices[0]?.heightMm).toBe(1200);
  });

  it("includes basketball posts and floodlight columns in the 3D scene", () => {
    const segment: LayoutSegment = {
      id: "seg-features",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const basketballPost: ResolvedBasketballPostPlacement = {
      id: "bb-1",
      key: "bb-1",
      segmentId: "seg-features",
      offsetMm: 1200,
      point: { x: 1200, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      facing: "LEFT",
      spec: segment.spec,
      placement: { id: "bb-1", segmentId: "seg-features", offsetMm: 1200, facing: "LEFT" }
    };
    const floodlightColumn: ResolvedFloodlightColumnPlacement = {
      id: "fc-1",
      key: "fc-1",
      segmentId: "seg-features",
      offsetMm: 2200,
      point: { x: 2200, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: -1 },
      facing: "RIGHT",
      spec: segment.spec,
      placement: { id: "fc-1", segmentId: "seg-features", offsetMm: 2200, facing: "RIGHT" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map(), [], [basketballPost], [floodlightColumn]);

    expect(scene.basketballPosts).toHaveLength(1);
    expect(scene.floodlightColumns).toHaveLength(1);
    expect(scene.posts.some((post) => post.point.x === 1200 && post.point.y === 0)).toBe(false);
    expect(scene.posts.some((post) => post.point.x === 2200 && post.point.y === 0)).toBe(false);
    expect(scene.bounds.maxHeightMm).toBeGreaterThan(5000);
  });

  it("includes goal units, kickboards, pitch dividers, and side netting in the 3D scene", () => {
    const segment: LayoutSegment = {
      id: "seg-features-2",
      start: { x: 0, y: 0 },
      end: { x: 10100, y: 0 },
      spec: { system: "TWIN_BAR", height: "3m", twinBarVariant: "STANDARD" }
    };
    const goalUnit: ResolvedGoalUnitPlacement = {
      id: "goal-1",
      segmentId: "seg-features-2",
      centerOffsetMm: 5050,
      startOffsetMm: 3550,
      endOffsetMm: 6550,
      widthMm: 3000,
      depthMm: 1200,
      goalHeightMm: 3000,
      hasBasketballPost: true,
      enclosureHeightMm: 3000,
      entryPoint: { x: 3550, y: 0 },
      exitPoint: { x: 6550, y: 0 },
      recessEntryPoint: { x: 3550, y: 1200 },
      recessExitPoint: { x: 6550, y: 1200 },
      rearCenterPoint: { x: 5050, y: 1200 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      spec: segment.spec,
      enclosureSpec: segment.spec,
      placement: {
        id: "goal-1",
        segmentId: "seg-features-2",
        centerOffsetMm: 5050,
        side: "LEFT",
        widthMm: 3000,
        depthMm: 1200,
        goalHeightMm: 3000,
        hasBasketballPost: true
      }
    };
    const kickboard: ResolvedKickboardAttachment = {
      id: "kb-1",
      sourceAttachmentId: "kb-1",
      segmentId: "seg-features-2",
      start: segment.start,
      end: segment.end,
      lengthMm: 10100,
      boardCount: 5,
      placement: {
        id: "kb-1",
        segmentId: "seg-features-2",
        sectionHeightMm: 200,
        thicknessMm: 50,
        profile: "SQUARE",
        boardLengthMm: 2500
      }
    };
    const pitchDivider: ResolvedPitchDividerPlacement = {
      id: "divider-1",
      startPoint: { x: 0, y: 5000 },
      endPoint: { x: 30000, y: 5000 },
      spanMm: 30000,
      supportPoints: [{ x: 15000, y: 5000 }],
      supportPostCount: 1,
      isValid: true,
      validationMessage: null,
      placement: {
        id: "divider-1",
        startAnchor: { segmentId: "left", offsetMm: 0 },
        endAnchor: { segmentId: "right", offsetMm: 0 }
      }
    };
    const sideNetting: ResolvedSideNettingAttachment = {
      id: "net-1",
      segmentId: "seg-features-2",
      startOffsetMm: 0,
      endOffsetMm: 10100,
      start: segment.start,
      end: segment.end,
      lengthMm: 10100,
      baseFenceHeightMm: 3000,
      additionalHeightMm: 2000,
      totalHeightMm: 5000,
      extendedPostIndices: [2],
      extendedPostPoints: [{ x: 5050, y: 0 }],
      placement: {
        id: "net-1",
        segmentId: "seg-features-2",
        additionalHeightMm: 2000,
        extendedPostInterval: 3
      }
    };

    const scene = buildOptimization3DScene(
      [segment],
      [],
      new Map(),
      [],
      [],
      [],
      [goalUnit],
      [kickboard],
      [pitchDivider],
      [sideNetting]
    );

    expect(scene.goalUnits).toHaveLength(1);
    expect(scene.kickboards).toHaveLength(1);
    expect(scene.pitchDividers).toHaveLength(1);
    expect(scene.sideNettings).toHaveLength(1);
    expect(scene.bounds.maxHeightMm).toBeGreaterThanOrEqual(5000);
  });

  it("renders 1.2m twin bar as a 1.0m panel with a top rail", () => {
    const segment: LayoutSegment = {
      id: "seg-low",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "1.2m", twinBarVariant: "STANDARD" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map());

    expect(scene.panelSlices).toHaveLength(1);
    expect(scene.panelSlices[0]?.heightMm).toBe(1000);
    expect(scene.rails).toHaveLength(1);
    expect(scene.rails[0]?.diameterMm).toBe(60);
    expect(scene.posts[0]?.heightMm).toBe(1200);
  });

  it("keeps plan-view Y orientation aligned in 3D scene bounds", () => {
    const segment: LayoutSegment = {
      id: "seg-oriented",
      start: { x: 1000, y: 2000 },
      end: { x: 1000, y: 6500 },
      spec: { system: "TWIN_BAR", height: "3m", twinBarVariant: "STANDARD" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map());

    expect(scene.bounds.minX).toBe(1000);
    expect(scene.bounds.maxX).toBe(1000);
    expect(scene.bounds.minZ).toBe(2000);
    expect(scene.bounds.maxZ).toBe(6500);
  });

  it("keeps overlays for each plan separate when several plans are shown together", () => {
    const segment: LayoutSegment = {
      id: "seg-multi",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const plans: TwinBarOptimizationPlan[] = [
      {
        id: "plan-a",
        variant: "STANDARD",
        stockPanelHeightMm: 2000,
        stockPanelWidthMm: 2525,
        consumedMm: 1200,
        leftoverMm: 1325,
        reusableLeftoverMm: 1325,
        reusedCuts: 1,
        panelsSaved: 0,
        cuts: [
          {
            id: "plan-a-cut-1",
            step: 1,
            mode: "OPEN_STOCK_PANEL",
            demand: { segmentId: "seg-multi", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
            lengthMm: 700,
            effectiveLengthMm: 900,
            offcutBeforeMm: 2525,
            offcutAfterMm: 1825
          },
          {
            id: "plan-a-cut-2",
            step: 2,
            mode: "REUSE_OFFCUT",
            demand: { segmentId: "seg-multi", startOffsetMm: 700, endOffsetMm: 1200, lengthMm: 500 },
            lengthMm: 500,
            effectiveLengthMm: 700,
            offcutBeforeMm: 1825,
            offcutAfterMm: 1125
          }
        ]
      },
      {
        id: "plan-b",
        variant: "STANDARD",
        stockPanelHeightMm: 2000,
        stockPanelWidthMm: 2525,
        consumedMm: 900,
        leftoverMm: 1625,
        reusableLeftoverMm: 1625,
        reusedCuts: 0,
        panelsSaved: 0,
        cuts: [
          {
            id: "plan-b-cut-1",
            step: 1,
            mode: "OPEN_STOCK_PANEL",
            demand: { segmentId: "seg-multi", startOffsetMm: 200, endOffsetMm: 1100, lengthMm: 900 },
            lengthMm: 900,
            effectiveLengthMm: 1100,
            offcutBeforeMm: 2525,
            offcutAfterMm: 1425
          }
        ]
      }
    ];

    const scene = buildOptimization3DScene([segment], plans, new Map([["seg-multi", 1]]));

    expect(scene.cutOverlays).toHaveLength(3);
    expect(scene.cutOverlays.map((overlay) => overlay.planId)).toEqual(["plan-a", "plan-a", "plan-b"]);
    expect(scene.cutOverlays.map((overlay) => overlay.planIndex)).toEqual([0, 0, 1]);
    expect(scene.reuseLinks).toHaveLength(1);
    expect(scene.reuseLinks[0]?.planId).toBe("plan-a");
  });
});
