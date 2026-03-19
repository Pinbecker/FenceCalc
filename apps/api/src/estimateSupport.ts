import type {
  BasketballFeaturePlacement,
  BasketballPostPlacement,
  EstimateResult,
  FloodlightColumnPlacement,
  GatePlacement,
  GoalUnitPlacement,
  KickboardAttachment,
  LayoutModel
} from "@fence-estimator/contracts";
import { DRAWING_SCHEMA_VERSION } from "@fence-estimator/contracts";
import { RULES_ENGINE_VERSION, estimateDrawingLayout } from "@fence-estimator/rules-engine";

type LayoutInput = Omit<LayoutModel, "sideNettings"> & {
  sideNettings?: Array<{
    id: string;
    segmentId: string;
    additionalHeightMm: number;
    startOffsetMm?: number | undefined;
    endOffsetMm?: number | undefined;
    extendedPostInterval: 3;
  }> | undefined;
};

function roundOptionalOffset(offsetMm: number | undefined): number | undefined {
  return offsetMm === undefined ? undefined : Math.round(offsetMm);
}

export function normalizeLayout(layout: LayoutInput): LayoutModel {
  return {
    segments: layout.segments.map((segment) => ({
      ...segment,
      start: { x: Math.round(segment.start.x), y: Math.round(segment.start.y) },
      end: { x: Math.round(segment.end.x), y: Math.round(segment.end.y) }
    })),
    gates: (layout.gates ?? []).map((gate): GatePlacement => ({
      ...gate,
      startOffsetMm: Math.round(gate.startOffsetMm),
      endOffsetMm: Math.round(gate.endOffsetMm)
    })),
    basketballFeatures: (layout.basketballFeatures ?? []).map((basketballFeature): BasketballFeaturePlacement => ({
      ...basketballFeature,
      offsetMm: Math.round(basketballFeature.offsetMm)
    })),
    basketballPosts: (layout.basketballPosts ?? []).map((basketballPost): BasketballPostPlacement => ({
      ...basketballPost,
      offsetMm: Math.round(basketballPost.offsetMm)
    })),
    floodlightColumns: (layout.floodlightColumns ?? []).map((floodlightColumn): FloodlightColumnPlacement => ({
      ...floodlightColumn,
      offsetMm: Math.round(floodlightColumn.offsetMm)
    })),
    goalUnits: (layout.goalUnits ?? []).map((goalUnit): GoalUnitPlacement => ({
      ...goalUnit,
      centerOffsetMm: Math.round(goalUnit.centerOffsetMm),
      depthMm: Math.round(goalUnit.depthMm)
    })),
    kickboards: (layout.kickboards ?? []).map((kickboard): KickboardAttachment => ({
      ...kickboard
    })),
    pitchDividers: (layout.pitchDividers ?? []).map((pitchDivider) => ({
      ...pitchDivider,
      startAnchor: {
        ...pitchDivider.startAnchor,
        offsetMm: Math.round(pitchDivider.startAnchor.offsetMm)
      },
      endAnchor: {
        ...pitchDivider.endAnchor,
        offsetMm: Math.round(pitchDivider.endAnchor.offsetMm)
      }
    })),
    sideNettings: (layout.sideNettings ?? []).map((sideNetting) => {
      const startOffsetMm = roundOptionalOffset(sideNetting.startOffsetMm);
      const endOffsetMm = roundOptionalOffset(sideNetting.endOffsetMm);
      return {
        id: sideNetting.id,
        segmentId: sideNetting.segmentId,
        additionalHeightMm: Math.round(sideNetting.additionalHeightMm),
        extendedPostInterval: sideNetting.extendedPostInterval,
        ...(startOffsetMm === undefined ? {} : { startOffsetMm }),
        ...(endOffsetMm === undefined ? {} : { endOffsetMm })
      };
    })
  };
}

export function buildEstimate(layout: LayoutInput): {
  layout: LayoutModel;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
} {
  const normalized = normalizeLayout(layout);
  return {
    layout: normalized,
    estimate: estimateDrawingLayout(normalized),
    schemaVersion: DRAWING_SCHEMA_VERSION,
    rulesVersion: RULES_ENGINE_VERSION
  };
}
