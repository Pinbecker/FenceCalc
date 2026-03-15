import { useMemo } from "react";
import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { formatHeightLabelFromMm, formatLengthMm } from "./formatters";
import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement
} from "./editor/types.js";
import { Optimization3DCanvasStage } from "./Optimization3DCanvasStage.js";
import { Optimization3DPlanSelector } from "./Optimization3DPlanSelector.js";
import { Optimization3DPlanSteps } from "./Optimization3DPlanSteps.js";
import { buildOptimization3DScene } from "./optimization3D.js";
import { formatVariantLabel } from "./optimization3DRenderData.js";
import { useOptimization3DOrbit } from "./useOptimization3DOrbit.js";

interface Optimization3DViewProps {
  estimateSegments: LayoutSegment[];
  activePlan: TwinBarOptimizationPlan | null;
  activePlanIndex: number | null;
  planCount: number;
  plans: TwinBarOptimizationPlan[];
  segmentOrdinalById: Map<string, number>;
  gates: ResolvedGatePlacement[];
  basketballPosts: ResolvedBasketballPostPlacement[];
  floodlightColumns: ResolvedFloodlightColumnPlacement[];
  onSelectPlan: (planId: string) => void;
}

function buildLegendItems(): string[] {
  return [
    "Fresh stock cut",
    "Reused offcut",
    "Offcut path",
    "Gate",
    "Basketball post",
    "Floodlight column"
  ];
}

export function Optimization3DView({
  estimateSegments,
  activePlan,
  activePlanIndex,
  planCount,
  plans,
  segmentOrdinalById,
  gates,
  basketballPosts,
  floodlightColumns,
  onSelectPlan
}: Optimization3DViewProps) {
  const orbitController = useOptimization3DOrbit();
  const scene = useMemo(
    () =>
      buildOptimization3DScene(
        estimateSegments,
        activePlan ? [activePlan] : [],
        segmentOrdinalById,
        gates,
        basketballPosts,
        floodlightColumns
      ),
    [activePlan, basketballPosts, estimateSegments, floodlightColumns, gates, segmentOrdinalById]
  );
  const freshCutCount = activePlan?.cuts.filter((cut) => cut.mode === "OPEN_STOCK_PANEL").length ?? 0;
  const reuseCutCount = activePlan?.cuts.filter((cut) => cut.mode === "REUSE_OFFCUT").length ?? 0;
  const legendItems = buildLegendItems();
  const reuseCountLabel = `${reuseCutCount} ${reuseCutCount === 1 ? "reuse" : "reuses"}`;
  const freshCountLabel = `${freshCutCount} ${freshCutCount === 1 ? "fresh cut" : "fresh cuts"}`;

  return (
    <section className="optimization-3d-view" aria-label="3D reuse view">
      <div className="optimization-3d-copy">
        <div>
          <h3>3D Reuse View</h3>
          <p className="muted-line">
            Drag to orbit, hold Shift and drag to pan, and scroll to zoom. The picker only includes opened panels that
            actually get reused, and the view shows one full reuse chain at a time.
          </p>
        </div>
        <button type="button" className="optimization-3d-reset" onClick={() => orbitController.resetOrbit()}>
          Reset view
        </button>
      </div>

      <Optimization3DPlanSelector
        activePlan={activePlan}
        activePlanIndex={activePlanIndex}
        planCount={planCount}
        plans={plans}
        onSelectPlan={onSelectPlan}
        formatLengthLabel={formatLengthMm}
      />

      {activePlan ? (
        <div className="optimization-3d-meta">
          {activePlanIndex !== null && planCount > 1 ? <span>Opened panel {activePlanIndex + 1} of {planCount}</span> : null}
          <span>{formatVariantLabel(activePlan.variant)}</span>
          <span>{formatHeightLabelFromMm(activePlan.stockPanelHeightMm)} stock</span>
          <span>{freshCountLabel}</span>
          <span>{reuseCountLabel}</span>
          <span>{formatLengthMm(activePlan.leftoverMm)} left</span>
        </div>
      ) : null}

      <Optimization3DCanvasStage
        scene={scene}
        orbit={orbitController.orbit}
        stageHandlers={orbitController.stageHandlers}
      />

      <div className="optimization-3d-legend">
        <span>
          <i className="is-open" />
          {legendItems[0]}
        </span>
        <span>
          <i className="is-reuse" />
          {legendItems[1]}
        </span>
        <span>
          <i className="is-link" />
          {legendItems[2]}
        </span>
        <span>
          <i className="is-gate" />
          {legendItems[3]}
        </span>
        <span>
          <i className="is-basketball-post" />
          {legendItems[4]}
        </span>
        <span>
          <i className="is-floodlight" />
          {legendItems[5]}
        </span>
      </div>

      <Optimization3DPlanSteps
        activePlan={activePlan}
        segmentOrdinalById={segmentOrdinalById}
        formatLengthLabel={formatLengthMm}
      />
    </section>
  );
}
