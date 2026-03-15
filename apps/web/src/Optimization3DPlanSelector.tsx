import type { TwinBarOptimizationPlan } from "@fence-estimator/contracts";

interface Optimization3DPlanSelectorProps {
  activePlan: TwinBarOptimizationPlan | null;
  activePlanIndex: number | null;
  planCount: number;
  plans: TwinBarOptimizationPlan[];
  onSelectPlan: (planId: string) => void;
  formatLengthLabel: (valueMm: number) => string;
}

export function Optimization3DPlanSelector({
  activePlan,
  activePlanIndex,
  planCount,
  plans,
  onSelectPlan,
  formatLengthLabel
}: Optimization3DPlanSelectorProps) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <div className="optimization-3d-selector" aria-label="Opened panel view selector">
      <div className="optimization-3d-selector-head">
        <strong>Opened panel view</strong>
        {activePlanIndex !== null && planCount > 1 ? (
          <span>
            Showing {activePlanIndex + 1} of {planCount}
          </span>
        ) : (
          <span>Showing the full reuse chain for the selected reusable panel</span>
        )}
      </div>

      <div className="optimization-3d-selector-controls">
        <button
          type="button"
          className="optimization-3d-selector-nav"
          onClick={() => {
            if (activePlanIndex === null || plans.length <= 1) {
              return;
            }
            const nextIndex = activePlanIndex <= 0 ? plans.length - 1 : activePlanIndex - 1;
            const nextPlan = plans[nextIndex];
            if (nextPlan) {
              onSelectPlan(nextPlan.id);
            }
          }}
          disabled={plans.length <= 1}
        >
          Prev
        </button>

        <div className="optimization-plan-strip-top optimization-plan-strip-inline">
          {plans.map((plan, index) => {
            const isActive = plan.id === activePlan?.id;
            return (
              <button
                key={plan.id}
                type="button"
                className={`optimization-plan-pill${isActive ? " is-active" : ""}`}
                onClick={() => onSelectPlan(plan.id)}
              >
                <span>Opened panel {index + 1}</span>
                <strong>
                  {plan.cuts.length} uses | {formatLengthLabel(plan.leftoverMm)} left
                </strong>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="optimization-3d-selector-nav"
          onClick={() => {
            if (activePlanIndex === null || plans.length <= 1) {
              return;
            }
            const nextIndex = activePlanIndex >= plans.length - 1 ? 0 : activePlanIndex + 1;
            const nextPlan = plans[nextIndex];
            if (nextPlan) {
              onSelectPlan(nextPlan.id);
            }
          }}
          disabled={plans.length <= 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
