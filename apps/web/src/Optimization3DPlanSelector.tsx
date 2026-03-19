import type { TwinBarOptimizationPlan } from "@fence-estimator/contracts";

interface Optimization3DPlanSelectorProps {
  activePlan: TwinBarOptimizationPlan | null;
  activePlanIndex: number | null;
  plans: TwinBarOptimizationPlan[];
  onSelectPlan: (planId: string) => void;
}

function formatReuseCountLabel(reusedCuts: number): string {
  return `${reusedCuts} ${reusedCuts === 1 ? "reuse" : "reuses"}`;
}

export function Optimization3DPlanSelector({
  activePlan,
  activePlanIndex,
  plans,
  onSelectPlan
}: Optimization3DPlanSelectorProps) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <div className="optimization-3d-selector" aria-label="Opened panel view selector">
      <div className="optimization-3d-selector-controls">
        <button
          type="button"
          className="optimization-3d-selector-nav"
          aria-label="Previous panel"
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
          {"<"}
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
                <span>Panel {index + 1}</span>
                <strong>{formatReuseCountLabel(plan.reusedCuts)}</strong>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="optimization-3d-selector-nav"
          aria-label="Next panel"
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
          {">"}
        </button>
      </div>
    </div>
  );
}
