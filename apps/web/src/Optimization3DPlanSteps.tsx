import type { TwinBarOptimizationPlan } from "@fence-estimator/contracts";

interface Optimization3DPlanStepsProps {
  activePlan: TwinBarOptimizationPlan | null;
  segmentOrdinalById: Map<string, number>;
  formatLengthLabel: (valueMm: number) => string;
}

export function Optimization3DPlanSteps({
  activePlan,
  segmentOrdinalById,
  formatLengthLabel
}: Optimization3DPlanStepsProps) {
  if (!activePlan) {
    return null;
  }

  return (
    <div className="optimization-3d-steps" aria-label="Active plan cut steps">
      {activePlan.cuts.map((cut) => {
        const segmentIndex = segmentOrdinalById.get(cut.demand.segmentId);
        const actionLabel = cut.mode === "OPEN_STOCK_PANEL" ? "Open panel" : "Reuse offcut";
        return (
          <article key={cut.id} className="optimization-3d-step-card">
            <span className={`optimization-3d-step-badge ${cut.mode === "OPEN_STOCK_PANEL" ? "is-open" : "is-reuse"}`}>
              {cut.step}
            </span>
            <div className="optimization-3d-step-copy">
              <strong>
                {actionLabel} on segment #{segmentIndex ?? "?"}
              </strong>
              <span>
                [{formatLengthLabel(cut.demand.startOffsetMm)}-{formatLengthLabel(cut.demand.endOffsetMm)}] | cut{" "}
                {formatLengthLabel(cut.lengthMm)} | offcut {formatLengthLabel(cut.offcutBeforeMm)} to{" "}
                {formatLengthLabel(cut.offcutAfterMm)}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
