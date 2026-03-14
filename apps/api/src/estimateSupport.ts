import type {
  BasketballPostPlacement,
  EstimateResult,
  FloodlightColumnPlacement,
  GatePlacement,
  LayoutModel
} from "@fence-estimator/contracts";
import { DRAWING_SCHEMA_VERSION } from "@fence-estimator/contracts";
import { RULES_ENGINE_VERSION, estimateDrawingLayout } from "@fence-estimator/rules-engine";

export function normalizeLayout(layout: LayoutModel): LayoutModel {
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
    basketballPosts: (layout.basketballPosts ?? []).map((basketballPost): BasketballPostPlacement => ({
      ...basketballPost,
      offsetMm: Math.round(basketballPost.offsetMm)
    })),
    floodlightColumns: (layout.floodlightColumns ?? []).map((floodlightColumn): FloodlightColumnPlacement => ({
      ...floodlightColumn,
      offsetMm: Math.round(floodlightColumn.offsetMm)
    }))
  };
}

export function buildEstimate(layout: LayoutModel): {
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
