import type { LayoutSegment, PointMm, TwinBarOptimizationCut, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

export interface OptimizationPlanVisualCut {
  cut: TwinBarOptimizationCut;
  start: PointMm;
  end: PointMm;
  center: PointMm;
}

export interface OptimizationPlanVisual {
  plan: TwinBarOptimizationPlan;
  cuts: OptimizationPlanVisualCut[];
  links: Array<{ start: PointMm; end: PointMm }>;
}

export function buildOptimizationPlanVisual(
  selectedPlan: TwinBarOptimizationPlan | null,
  estimateSegmentsById: Map<string, LayoutSegment>,
  interpolateAlongSegment: (segment: LayoutSegment, offsetMm: number) => PointMm,
): OptimizationPlanVisual | null {
  if (!selectedPlan) {
    return null;
  }

  const cuts = selectedPlan.cuts
    .map((cut) => {
      const segment = estimateSegmentsById.get(cut.demand.segmentId);
      if (!segment) {
        return null;
      }
      const start = interpolateAlongSegment(segment, cut.demand.startOffsetMm);
      const end = interpolateAlongSegment(segment, cut.demand.endOffsetMm);
      return {
        cut,
        start,
        end,
        center: {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
        }
      };
    })
    .filter((entry) => entry !== null);

  if (cuts.length === 0) {
    return null;
  }

  return {
    plan: selectedPlan,
    cuts,
    links: cuts.slice(1).map((cut, index) => ({
      start: cuts[index]?.center ?? cut.center,
      end: cut.center
    }))
  };
}
