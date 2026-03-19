import { useMemo, useState } from "react";
import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { formatHeightLabelFromMm, formatLengthMm } from "./formatters";
import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement
} from "./editor/types.js";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";
import { Optimization3DCanvasStage } from "./Optimization3DCanvasStage.js";
import { Optimization3DPlanSelector } from "./Optimization3DPlanSelector.js";
import { Optimization3DPlanSteps } from "./Optimization3DPlanSteps.js";
import { buildOptimization3DScene } from "./optimization3D.js";
import { formatVariantLabel } from "./optimization3DRenderData.js";
import { useOptimization3DOrbit } from "./useOptimization3DOrbit.js";
import { useOptimization3DWalk } from "./useOptimization3DWalk.js";

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
  goalUnits?: ResolvedGoalUnitPlacement[];
  kickboards?: ResolvedKickboardAttachment[];
  pitchDividers?: ResolvedPitchDividerPlacement[];
  sideNettings?: ResolvedSideNettingAttachment[];
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

function normalizeHeadingDegrees(yaw: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = ((yaw % fullTurn) + fullTurn) % fullTurn;
  return Math.round((normalized * 180) / Math.PI);
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
  goalUnits = [],
  kickboards = [],
  pitchDividers = [],
  sideNettings = [],
  onSelectPlan
}: Optimization3DViewProps) {
  const [cameraMode, setCameraMode] = useState<"orbit" | "walk">("orbit");
  const orbitController = useOptimization3DOrbit();
  const scene = useMemo(
    () =>
      buildOptimization3DScene(
        estimateSegments,
        activePlan ? [activePlan] : [],
        segmentOrdinalById,
        gates,
        basketballPosts,
        floodlightColumns,
        goalUnits,
        kickboards,
        pitchDividers,
        sideNettings
      ),
    [activePlan, basketballPosts, estimateSegments, floodlightColumns, gates, goalUnits, kickboards, pitchDividers, segmentOrdinalById, sideNettings]
  );
  const walkController = useOptimization3DWalk(scene);
  const freshCutCount = activePlan?.cuts.filter((cut) => cut.mode === "OPEN_STOCK_PANEL").length ?? 0;
  const reuseCutCount = activePlan?.cuts.filter((cut) => cut.mode === "REUSE_OFFCUT").length ?? 0;
  const legendItems = buildLegendItems();
  const reuseCountLabel = `${reuseCutCount} ${reuseCutCount === 1 ? "reuse" : "reuses"}`;
  const freshCountLabel = `${freshCutCount} ${freshCutCount === 1 ? "fresh cut" : "fresh cuts"}`;
  const activeCamera = cameraMode === "walk" ? walkController.walk : orbitController.orbit;
  const activeStageHandlers = cameraMode === "walk" ? walkController.stageHandlers : orbitController.stageHandlers;
  const walkAcrossPercent = Math.round(
    ((walkController.walk.x - scene.bounds.minX) / Math.max(scene.bounds.maxX - scene.bounds.minX, 1)) * 100
  );
  const walkDepthPercent = Math.round(
    ((walkController.walk.z - scene.bounds.minZ) / Math.max(scene.bounds.maxZ - scene.bounds.minZ, 1)) * 100
  );
  const walkHud =
    cameraMode === "walk"
      ? {
          heading: `Heading ${normalizeHeadingDegrees(walkController.walk.yaw)}°`,
          eyeHeight: `Eye ${formatLengthMm(walkController.walk.eyeHeightMm)}`,
          position: `Pitch ${walkAcrossPercent}% across / ${walkDepthPercent}% deep`
        }
      : null;
  const resetActiveCamera = () => {
    if (cameraMode === "walk") {
      walkController.resetWalk();
      return;
    }
    orbitController.resetOrbit();
  };
  const instructions =
    cameraMode === "walk"
      ? "Walk mode: click the view first, drag to look around, use W A S D to move, hold Shift to move faster, use Q and E to change eye height, and press 0 to reset."
      : "Orbit mode: drag to orbit, hold Shift and drag to pan, and scroll to zoom. The picker only includes opened panels that actually get reused, and the view shows one full reuse chain at a time.";

  return (
    <section className="optimization-3d-view" aria-label="3D reuse view">
      <div className="optimization-3d-copy">
        <div>
          <h3>3D Reuse View</h3>
          <p className="muted-line">{instructions}</p>
        </div>
        <div className="optimization-3d-actions">
          <div className="optimization-3d-mode-toggle" role="group" aria-label="3D camera mode">
            <button
              type="button"
              className={`optimization-3d-mode-button ${cameraMode === "orbit" ? "is-active" : ""}`}
              onClick={() => setCameraMode("orbit")}
            >
              Orbit
            </button>
            <button
              type="button"
              className={`optimization-3d-mode-button ${cameraMode === "walk" ? "is-active" : ""}`}
              onClick={() => setCameraMode("walk")}
            >
              Walk
            </button>
          </div>
          <button type="button" className="optimization-3d-reset" onClick={resetActiveCamera}>
            Reset view
          </button>
        </div>
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
        camera={activeCamera}
        mode={cameraMode}
        stageHandlers={activeStageHandlers}
        walkHud={walkHud}
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
