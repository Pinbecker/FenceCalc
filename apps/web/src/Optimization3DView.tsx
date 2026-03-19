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
  savedPanels?: number;
  onSelectPlan: (planId: string) => void;
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
  savedPanels = 0,
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
  const activeCamera = cameraMode === "walk" ? walkController.walk : orbitController.orbit;
  const activeStageHandlers = cameraMode === "walk" ? walkController.stageHandlers : orbitController.stageHandlers;
  const reuseCountLabel = activePlan ? `${activePlan.reusedCuts} ${activePlan.reusedCuts === 1 ? "reuse" : "reuses"}` : null;
  const activePanelLabel =
    activePlanIndex !== null ? `Panel ${activePlanIndex + 1}${planCount > 1 ? ` of ${planCount}` : ""}` : activePlan ? "Panel view" : null;
  const selectedPanelChainSteps = activePlan
    ? activePlan.cuts.map((cut) => {
        const segmentIndex = segmentOrdinalById.get(cut.demand.segmentId);
        const offcutLabel = cut.offcutAfterMm > 0 ? `leaves ${formatLengthMm(cut.offcutAfterMm)} offcut` : "uses full remainder";
        return {
          id: cut.id,
          step: cut.step,
          title: `${cut.mode === "OPEN_STOCK_PANEL" ? "Open" : "Reuse"} S${segmentIndex ?? "?"}`,
          detail: `${formatLengthMm(cut.demand.startOffsetMm)}-${formatLengthMm(cut.demand.endOffsetMm)} / cut ${formatLengthMm(cut.lengthMm)} / ${offcutLabel}`
        };
      })
    : [];
  const selectedPanelDetail = activePlan
    ? `${activePlan.cuts.length} ${activePlan.cuts.length === 1 ? "cut" : "cuts"} in chain`
    : "No reusable panel selected";
  const selectedPanelRouteLabel = activePlan
    ? activePlan.cuts
        .map((cut) => {
          const segmentIndex = segmentOrdinalById.get(cut.demand.segmentId);
          return `${cut.mode === "OPEN_STOCK_PANEL" ? "Open" : "Reuse"} S${segmentIndex ?? "?"}`;
        })
        .join(" -> ")
    : null;
  const selectedPanelRouteMeta = activePlan
    ? `${formatLengthMm(activePlan.cuts[0]?.offcutBeforeMm ?? 0)} stock panel / ${formatLengthMm(
        activePlan.cuts[activePlan.cuts.length - 1]?.offcutAfterMm ?? 0
      )} left after chain`
    : null;
  const selectedPanelOverflowLabel =
    selectedPanelChainSteps.length > 3
      ? `+${selectedPanelChainSteps.length - 3} more ${selectedPanelChainSteps.length - 3 === 1 ? "cut" : "cuts"}`
      : null;
  const walkAcrossPercent = Math.round(
    ((walkController.walk.x - scene.bounds.minX) / Math.max(scene.bounds.maxX - scene.bounds.minX, 1)) * 100
  );
  const walkDepthPercent = Math.round(
    ((walkController.walk.z - scene.bounds.minZ) / Math.max(scene.bounds.maxZ - scene.bounds.minZ, 1)) * 100
  );
  const walkHud =
    cameraMode === "walk"
      ? {
          heading: `Heading ${normalizeHeadingDegrees(walkController.walk.yaw)} deg`,
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

  return (
    <section className="optimization-3d-view" aria-label="3D reuse view">
      <div className="optimization-3d-stage-shell">
        <Optimization3DCanvasStage
          scene={scene}
          camera={activeCamera}
          mode={cameraMode}
          stageHandlers={activeStageHandlers}
          walkHud={walkHud}
        />
        <div className="optimization-3d-top-overlay optimization-3d-top-left">
          <div className="optimization-3d-panel-detail">
            <strong>{activePanelLabel ?? "Panel view"}</strong>
            <span>{selectedPanelDetail}</span>
            {selectedPanelRouteLabel ? <b className="optimization-3d-panel-detail-route">{selectedPanelRouteLabel}</b> : null}
            {selectedPanelRouteMeta ? <small className="optimization-3d-panel-detail-meta">{selectedPanelRouteMeta}</small> : null}
            {selectedPanelChainSteps.length > 0 ? (
              <div className="optimization-3d-panel-detail-steps">
                {selectedPanelChainSteps.slice(0, 3).map((step) => (
                  <div key={step.id} className="optimization-3d-panel-detail-step">
                    <em>{step.step}</em>
                    <div>
                      <b>{step.title}</b>
                      <small>{step.detail}</small>
                    </div>
                  </div>
                ))}
                {selectedPanelOverflowLabel ? <small className="optimization-3d-panel-detail-more">{selectedPanelOverflowLabel}</small> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="optimization-3d-top-overlay optimization-3d-top-center">
          <div className="optimization-3d-status-strip">
            <span className="optimization-3d-status-chip">3D Reuse View</span>
            {savedPanels > 0 ? <span className="optimization-3d-status-chip">{savedPanels} saved</span> : null}
            {activePanelLabel ? <span className="optimization-3d-status-chip">{activePanelLabel}</span> : null}
            {reuseCountLabel ? <span className="optimization-3d-status-chip">{reuseCountLabel}</span> : null}
            {activePlan ? (
              <span className="optimization-3d-status-chip">
                {formatVariantLabel(activePlan.variant)} {formatHeightLabelFromMm(activePlan.stockPanelHeightMm)}
              </span>
            ) : null}
            <span className="optimization-3d-status-chip is-open-key">Fresh</span>
            <span className="optimization-3d-status-chip is-reuse-key">Reuse</span>
            <button type="button" className="optimization-3d-reset optimization-3d-overlay-button" onClick={resetActiveCamera}>
              Reset view
            </button>
          </div>
        </div>
        <div className="optimization-3d-top-overlay optimization-3d-top-right">
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
        </div>
        <div className="optimization-3d-panel-overlay">
          <Optimization3DPlanSelector
            activePlan={activePlan}
            activePlanIndex={activePlanIndex}
            plans={plans}
            onSelectPlan={onSelectPlan}
          />
        </div>
      </div>
    </section>
  );
}
