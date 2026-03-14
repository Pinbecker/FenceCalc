import type {
  LayoutSegment,
  OptimizationSummary,
  TwinBarOptimizationBucket,
  TwinBarOptimizationPlan,
  TwinBarVariant
} from "@fence-estimator/contracts";

import { formatHeightLabelFromMm, formatLengthMm } from "./formatters";
import { Optimization3DView } from "./Optimization3DView";
import { getVisibleOptimizationBuckets } from "./optimizationDisplay";

interface OptimizationPlannerProps {
  summary: OptimizationSummary;
  estimateSegments: LayoutSegment[];
  canInspect: boolean;
  isOpen: boolean;
  selectedPlanId: string | null;
  segmentOrdinalById: Map<string, number>;
  onOpen: () => void;
  onClose: () => void;
  onSelectPlan: (planId: string) => void;
}

function formatVariantShortLabel(variant: TwinBarVariant): string {
  return variant === "SUPER_REBOUND" ? "SR" : "Std";
}

function formatVariantLongLabel(variant: TwinBarVariant): string {
  return variant === "SUPER_REBOUND" ? "Super Rebound" : "Standard";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSegmentWindow(startOffsetMm: number, endOffsetMm: number): string {
  return `[${formatLengthMm(startOffsetMm)}-${formatLengthMm(endOffsetMm)}]`;
}

function formatSolverLabel(bucket: TwinBarOptimizationBucket): string {
  return bucket.solver === "EXACT_SEARCH" ? "Exact search" : "Best-fit packing";
}

function buildDockHeadline(summary: OptimizationSummary, canInspect: boolean): string {
  const savingPlans = summary.twinBar.buckets.reduce(
    (sum, bucket) => sum + bucket.plans.filter((plan) => plan.panelsSaved > 0).length,
    0,
  );
  if (!canInspect) {
    return "No layout to plan yet";
  }
  if (summary.twinBar.totalCutDemands === 0) {
    return "No cut pieces need planning";
  }
  if (savingPlans === 0) {
    return "No panel-saving reuse found";
  }
  return `${summary.twinBar.panelsSaved} panels saved in live cut plan`;
}

function buildDockCopy(summary: OptimizationSummary, canInspect: boolean): string {
  const savingPlans = summary.twinBar.buckets.reduce(
    (sum, bucket) => sum + bucket.plans.filter((plan) => plan.panelsSaved > 0).length,
    0,
  );
  if (!canInspect) {
    return "Draw a layout to generate stock-panel plans.";
  }
  if (summary.twinBar.totalCutDemands === 0) {
    return `${summary.twinBar.fixedFullPanels} full panels already land cleanly.`;
  }
  if (savingPlans === 0) {
    return `${summary.twinBar.totalCutDemands} cut pieces exist, but none combine into a saved panel.`;
  }
  return `${summary.twinBar.totalCutDemands} cut pieces packed into ${summary.twinBar.stockPanelsOpened} stock panels.`;
}

function buildGroupTitle(bucket: TwinBarOptimizationBucket): string {
  return `${formatVariantLongLabel(bucket.variant)} ${formatHeightLabelFromMm(bucket.stockPanelHeightMm)}`;
}

function findPlanIndex(bucket: TwinBarOptimizationBucket, plan: TwinBarOptimizationPlan): number {
  return bucket.plans.findIndex((candidate) => candidate.id === plan.id) + 1;
}

export function OptimizationPlanner({
  summary,
  estimateSegments,
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
  const activePlan = visiblePlans.find((plan) => plan.id === selectedPlanId) ?? visiblePlans[0] ?? null;
  const activePlanId = activePlan?.id ?? null;
  const hasVisibleSavings = visiblePlans.length > 0;
  const visiblePanelsSaved = visiblePlans.reduce((sum, plan) => sum + plan.panelsSaved, 0);
  const visibleReusedCuts = visiblePlans.reduce((sum, plan) => sum + plan.reusedCuts, 0);
  const visibleLeftoverMm = visiblePlans.reduce((sum, plan) => sum + plan.leftoverMm, 0);
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
              <div>
                <h2>Cut Planner</h2>
                <p className="muted-line">
                  Live stock-panel plan grouped by variant and stock height. Every plan below is one real panel opened for
                  the job.
                </p>
              </div>
              <button type="button" className="panel-close" onClick={onClose}>
                x
              </button>
            </div>

            <Optimization3DView
              estimateSegments={estimateSegments}
              activePlan={activePlan}
              segmentOrdinalById={segmentOrdinalById}
            />

            {!hasCutDemand ? (
              <div className="optimization-empty">
                <h3>No cut planning needed</h3>
                <p className="muted-line">
                  This layout currently uses {twinBar.fixedFullPanels} full panels with no remainder cuts, so there is no
                  offcut plan to optimise.
                </p>
              </div>
            ) : !hasVisibleSavings ? (
              <div className="optimization-empty">
                <h3>No panel-saving reuse found</h3>
                <p className="muted-line">
                  This layout has {twinBar.totalCutDemands} remainder cuts, but none of them chain together into a saved
                  stock panel. Non-saving single cuts are hidden here on purpose.
                </p>
              </div>
            ) : (
              <>
                <div className="optimization-metrics">
                  <article className="optimization-metric">
                    <span>Panels Saved</span>
                    <strong>{visiblePanelsSaved}</strong>
                  </article>
                  <article className="optimization-metric">
                    <span>Reuse Coverage</span>
                    <strong>{formatPercent(visibleReusedCuts / twinBar.totalCutDemands)}</strong>
                  </article>
                  <article className="optimization-metric">
                    <span>Saving Plans</span>
                    <strong>{visiblePlans.length}</strong>
                  </article>
                  <article className="optimization-metric">
                    <span>Leftover After Plan</span>
                    <strong>{formatLengthMm(visibleLeftoverMm)}</strong>
                  </article>
                </div>

                <div className="optimization-story">
                  Only plans that actually save a panel are shown. Step 1 opens a fresh stock panel, later steps reuse the
                  remaining offcut, and their consumed width already includes the {formatLengthMm(twinBar.reuseAllowanceMm)}{" "}
                  reuse allowance.
                </div>

                <div className="optimization-bucket-strip">
                  {visibleBuckets.map((bucket) => (
                    <article key={`${bucket.variant}-${bucket.stockPanelHeightMm}`} className="optimization-bucket-pill">
                      <span>
                        {formatVariantShortLabel(bucket.variant)} {formatHeightLabelFromMm(bucket.stockPanelHeightMm)}
                      </span>
                      <strong>
                        save {bucket.panelsSaved} | reuse {bucket.reusedCuts}/{bucket.cutDemands}
                      </strong>
                    </article>
                  ))}
                </div>

                <div className="optimization-plan-groups">
                  {visibleBuckets.map((bucket) => (
                    <section key={`${bucket.variant}-${bucket.stockPanelHeightMm}`} className="optimization-group">
                      <div className="optimization-group-head">
                        <div>
                          <h3>{buildGroupTitle(bucket)}</h3>
                          <p className="muted-line">
                            Showing {bucket.plans.length} panel-saving plans from {bucket.cutDemands} cut pieces. {bucket.fullPanels}{" "}
                            untouched full panels stay hidden.
                          </p>
                        </div>
                        <div className="optimization-group-meta">
                          <span>{formatSolverLabel(bucket)}</span>
                          <strong>{formatPercent(bucket.utilizationRate)} utilised</strong>
                        </div>
                      </div>

                      <div className="optimization-plan-grid">
                        {bucket.plans.map((plan) => {
                          const planIndex = findPlanIndex(bucket, plan);
                          const isSelected = plan.id === activePlanId;
                          const isCanvasHighlighted = plan.id === selectedPlanId;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              className={`optimization-plan-card${isSelected ? " active" : ""}`}
                              onClick={() => onSelectPlan(plan.id)}
                            >
                              <div className="optimization-plan-card-head">
                                <div>
                                  <span className="optimization-plan-kicker">Panel Plan {planIndex}</span>
                                  <strong>
                                    saves {plan.panelsSaved} | {plan.cuts.length} cuts
                                  </strong>
                                </div>
                                <span className="optimization-plan-leftover">{formatLengthMm(plan.leftoverMm)} left</span>
                              </div>

                              <div className="optimization-plan-bar" aria-hidden="true">
                                {plan.cuts.map((cut) => {
                                  const widthMm = cut.mode === "OPEN_STOCK_PANEL" ? cut.lengthMm : cut.effectiveLengthMm;
                                  return (
                                    <span
                                      key={cut.id}
                                      className={`optimization-plan-bar-segment ${
                                        cut.mode === "OPEN_STOCK_PANEL" ? "is-open" : "is-reuse"
                                      }`}
                                      style={{ flexGrow: widthMm }}
                                    />
                                  );
                                })}
                                {plan.leftoverMm > 0 ? (
                                  <span className="optimization-plan-bar-segment is-leftover" style={{ flexGrow: plan.leftoverMm }} />
                                ) : null}
                              </div>

                              <div className="optimization-step-list">
                                {plan.cuts.map((cut) => {
                                  const segmentIndex = segmentOrdinalById.get(cut.demand.segmentId);
                                  return (
                                    <div key={cut.id} className="optimization-step-row">
                                      <span className={`optimization-step-badge ${cut.mode === "OPEN_STOCK_PANEL" ? "is-open" : "is-reuse"}`}>
                                        {cut.step}
                                      </span>
                                      <div className="optimization-step-copy">
                                        <strong>
                                          {cut.mode === "OPEN_STOCK_PANEL" ? "Open panel" : "Reuse offcut"} on segment #
                                          {segmentIndex ?? "?"}
                                        </strong>
                                        <span>
                                          {formatSegmentWindow(cut.demand.startOffsetMm, cut.demand.endOffsetMm)} | cut{" "}
                                          {formatLengthMm(cut.lengthMm)} | offcut {formatLengthMm(cut.offcutBeforeMm)} to{" "}
                                          {formatLengthMm(cut.offcutAfterMm)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {isSelected ? (
                                <span className="optimization-plan-selection">
                                  {isCanvasHighlighted ? "Shown above and on canvas" : "Shown above"}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
