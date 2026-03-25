import type {
  LayoutSegment,
  OptimizationSummary
} from "@fence-estimator/contracts";

import { Optimization3DView } from "./Optimization3DView";
import { getVisibleOptimizationBuckets } from "./optimizationDisplay";
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

interface OptimizationPlannerProps {
  summary: OptimizationSummary;
  estimateSegments: LayoutSegment[];
  gates: ResolvedGatePlacement[];
  basketballPosts: ResolvedBasketballPostPlacement[];
  floodlightColumns: ResolvedFloodlightColumnPlacement[];
  goalUnits?: ResolvedGoalUnitPlacement[];
  kickboards?: ResolvedKickboardAttachment[];
  pitchDividers?: ResolvedPitchDividerPlacement[];
  sideNettings?: ResolvedSideNettingAttachment[];
  canInspect: boolean;
  isOpen: boolean;
  selectedPlanId: string | null;
  segmentOrdinalById: Map<string, number>;
  onOpen: () => void;
  onClose: () => void;
  onSelectPlan: (planId: string) => void;
}

function formatPanelCountLabel(count: number): string {
  return `${count} ${count === 1 ? "panel" : "panels"}`;
}

function formatOpenedPanelCountLabel(count: number): string {
  return `${count} opened stock ${count === 1 ? "panel" : "panels"}`;
}

function buildDockHeadline(summary: OptimizationSummary, canInspect: boolean): string {
  if (!canInspect) {
    return "No layout to plan yet";
  }
  if (summary.twinBar.totalCutDemands === 0) {
    return "No cut pieces need planning";
  }
  if (summary.twinBar.panelsSaved === 0) {
    return "No panels saved in live cut layout";
  }
  return `${formatPanelCountLabel(summary.twinBar.panelsSaved)} saved in live cut layout`;
}

function buildDockCopy(summary: OptimizationSummary, canInspect: boolean): string {
  if (!canInspect) {
    return "Draw a layout to generate stock-panel plans.";
  }
  if (summary.twinBar.totalCutDemands === 0) {
    return `${summary.twinBar.fixedFullPanels} full panels already land cleanly.`;
  }
  return `${summary.twinBar.totalCutDemands} cut pieces are covered by ${formatOpenedPanelCountLabel(
    summary.twinBar.stockPanelsOpened
  )}.`;
}

export function OptimizationPlanner({
  summary,
  estimateSegments,
  gates,
  basketballPosts,
  floodlightColumns,
  goalUnits = [],
  kickboards = [],
  pitchDividers = [],
  sideNettings = [],
  canInspect,
  isOpen,
  selectedPlanId,
  segmentOrdinalById,
  onOpen,
  onClose,
  onSelectPlan
}: OptimizationPlannerProps) {
  const { twinBar } = summary;
  const hasCutDemand = twinBar.totalCutDemands > 0;
  const visibleBuckets = getVisibleOptimizationBuckets(summary);
  const visiblePlans = visibleBuckets.flatMap((bucket) => bucket.plans);
  const reusablePlans = visiblePlans.filter(
    (plan) => plan.reusedCuts > 0 || plan.cuts.some((cut) => cut.mode === "REUSE_OFFCUT")
  );
  const activePlan =
    reusablePlans.find((plan) => plan.id === selectedPlanId) ??
    reusablePlans[0] ??
    visiblePlans.find((plan) => plan.id === selectedPlanId) ??
    visiblePlans[0] ??
    null;
  const activePlanIndex = activePlan ? reusablePlans.findIndex((plan) => plan.id === activePlan.id) : -1;
  const hasVisiblePlans = visiblePlans.length > 0;
  const displayPlans = reusablePlans.length > 0 ? reusablePlans : visiblePlans;
  const visiblePanelsSaved = displayPlans.reduce((sum, plan) => sum + plan.panelsSaved, 0);
  const handleOpenPlanner = () => {
    const firstVisiblePlan = visiblePlans[0] ?? null;
    if ((selectedPlanId === null || !visiblePlans.some((plan) => plan.id === selectedPlanId)) && firstVisiblePlan) {
      onSelectPlan(firstVisiblePlan.id);
    }
    onOpen();
  };

  return (
    <>
      <section className="optimization-mini">
        <div className="optimization-mini-copy">
          <p className="optimization-mini-headline">{buildDockHeadline(summary, canInspect)}</p>
          <p className="optimization-mini-subline">{buildDockCopy(summary, canInspect)}</p>
        </div>
        <div className="optimization-mini-actions">
          <button type="button" className="optimization-dock-btn" onClick={handleOpenPlanner} disabled={!canInspect}>
            Open Planner
          </button>
        </div>
      </section>

      {isOpen ? (
        <div className="optimization-modal-backdrop" onMouseDown={onClose}>
          <section className="panel-block optimization-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="optimization-modal-head">
              <div className="optimization-modal-title">
                <h2>Cut Planner</h2>
                {hasVisiblePlans ? <span className="optimization-modal-chip">{visiblePanelsSaved} saved</span> : null}
              </div>
              <button type="button" className="panel-close" onClick={onClose}>
                x
              </button>
            </div>

            <Optimization3DView
              estimateSegments={estimateSegments}
              activePlan={activePlan}
              activePlanIndex={activePlanIndex >= 0 ? activePlanIndex : null}
              planCount={reusablePlans.length}
              plans={reusablePlans}
              segmentOrdinalById={segmentOrdinalById}
              gates={gates}
              basketballPosts={basketballPosts}
              floodlightColumns={floodlightColumns}
              goalUnits={goalUnits}
              kickboards={kickboards}
              pitchDividers={pitchDividers}
              sideNettings={sideNettings}
              savedPanels={visiblePanelsSaved}
              onSelectPlan={onSelectPlan}
            />

            {!hasCutDemand ? (
              <div className="optimization-empty">
                <h3>No cut planning needed</h3>
                <p className="muted-line">
                  This layout currently uses {twinBar.fixedFullPanels} full panels with no remainder cuts, so there is no
                  offcut plan to optimise.
                </p>
              </div>
            ) : !hasVisiblePlans ? (
              <div className="optimization-empty">
                <h3>No stock-panel plans available</h3>
                <p className="muted-line">
                  This layout has {twinBar.totalCutDemands} remainder cuts, but no stock-panel plans were generated for
                  review.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
