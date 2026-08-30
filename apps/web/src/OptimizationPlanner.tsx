import type { LayoutSegment, OptimizationSummary } from "@fence-estimator/contracts";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment,
} from "@fence-estimator/rules-engine";

import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
} from "./editor/types.js";
import { PanelCutPlan } from "./PanelCutPlan";

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

function dockHeadline(summary: OptimizationSummary, canInspect: boolean): string {
  if (!canInspect) return "No drawing to plan yet";
  if (summary.twinBar.totalCutDemands === 0) return "No panel cuts required";
  return `${summary.twinBar.stockPanelsOpened} stock panels cover ${summary.twinBar.totalCutDemands} cuts`;
}

function dockCopy(summary: OptimizationSummary, canInspect: boolean): string {
  if (!canInspect) return "Draw a fence layout to generate a cutting sheet.";
  if (summary.twinBar.totalCutDemands === 0) {
    return `${summary.twinBar.fixedFullPanels} full panels land cleanly with no remainder cuts.`;
  }
  return `${summary.twinBar.panelsSaved} panels saved · ${Math.round(summary.twinBar.utilizationRate * 100)}% stock utilisation.`;
}

export function OptimizationPlanner(props: OptimizationPlannerProps) {
  const {
    summary,
    canInspect,
    isOpen,
    selectedPlanId,
    segmentOrdinalById,
    onOpen,
    onClose,
    onSelectPlan,
  } = props;
  const canOpen = canInspect && summary.twinBar.totalCutDemands > 0;
  const handleOpen = () => {
    const firstPlan = summary.twinBar.buckets.flatMap((bucket) => bucket.plans)[0];
    if (!selectedPlanId && firstPlan) onSelectPlan(firstPlan.id);
    onOpen();
  };

  return (
    <>
      <section className="optimization-mini" aria-label="Panel cut plan summary">
        <div className="optimization-mini-copy">
          <p className="optimization-mini-headline">{dockHeadline(summary, canInspect)}</p>
          <p className="optimization-mini-subline">{dockCopy(summary, canInspect)}</p>
        </div>
        <div className="optimization-mini-actions">
          <button
            type="button"
            className="optimization-dock-btn"
            onClick={handleOpen}
            disabled={!canOpen}
          >
            Open Panel Cut Plan
          </button>
        </div>
      </section>

      {isOpen ? (
        <div className="optimization-modal-backdrop" onMouseDown={onClose}>
          <section
            className="panel-block optimization-modal panel-cut-modal"
            aria-modal="true"
            aria-label="Panel Cut Plan"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="optimization-modal-head">
              <div className="optimization-modal-title">
                <div>
                  <p>Production layout</p>
                  <h2>Panel Cut Plan</h2>
                </div>
                <span className="optimization-modal-chip">
                  {summary.twinBar.panelsSaved} panels saved
                </span>
              </div>
              <button
                type="button"
                className="panel-close"
                aria-label="Close Panel Cut Plan"
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <PanelCutPlan
              summary={summary}
              selectedPlanId={selectedPlanId}
              segmentOrdinalById={segmentOrdinalById}
              onSelectPlan={onSelectPlan}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
