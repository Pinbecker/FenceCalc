import type {
  OptimizationSummary,
  TwinBarOptimizationBucket,
  TwinBarOptimizationCut,
  TwinBarOptimizationPlan,
} from "@fence-estimator/contracts";

interface PanelCutPlanProps {
  summary: OptimizationSummary;
  selectedPlanId: string | null;
  segmentOrdinalById: Map<string, number>;
  onSelectPlan: (planId: string) => void;
}

const millimetres = (value: number) => `${Math.round(value).toLocaleString("en-GB")}mm`;
const percentage = (value: number) => `${Math.round(value * 100)}%`;
const variantLabel = (variant: string) =>
  variant === "SUPER_REBOUND" ? "Super Rebound" : "Standard";

function bucketLabel(bucket: TwinBarOptimizationBucket): string {
  return `${variantLabel(bucket.variant)} · ${millimetres(bucket.stockPanelHeightMm)} high`;
}

function cutLocation(cut: TwinBarOptimizationCut, segmentOrdinalById: Map<string, number>): string {
  const ordinal = segmentOrdinalById.get(cut.demand.segmentId);
  const line = ordinal ? `Fence line ${ordinal}` : cut.demand.segmentId;
  const lift = cut.demand.lift ? ` · ${cut.demand.lift.toLowerCase()} lift` : "";
  return `${line} · ${millimetres(cut.demand.startOffsetMm)}–${millimetres(cut.demand.endOffsetMm)}${lift}`;
}

function CutBar({ plan }: { plan: TwinBarOptimizationPlan }) {
  return (
    <div className="panel-cut-bar" aria-label={`Stock panel ${plan.stockPanelWidthMm}mm wide`}>
      {plan.cuts.map((cut, index) => (
        <div key={cut.id} className="panel-cut-piece-wrap">
          {index > 0 ? (
            <span
              className="panel-cut-allowance"
              style={{
                width: `${((cut.effectiveLengthMm - cut.lengthMm) / plan.stockPanelWidthMm) * 100}%`,
              }}
              title="200mm reuse allowance"
            />
          ) : null}
          <span
            className={`panel-cut-piece tone-${index % 4}`}
            style={{ width: `${(cut.lengthMm / plan.stockPanelWidthMm) * 100}%` }}
            title={`Step ${cut.step}: cut ${millimetres(cut.lengthMm)}`}
          >
            <span>{cut.step}</span>
            <strong>{millimetres(cut.lengthMm)}</strong>
          </span>
        </div>
      ))}
      {plan.leftoverMm > 0 ? (
        <div
          className={`panel-cut-leftover${plan.reusableLeftoverMm > 0 ? " is-reusable" : ""}`}
          style={{ width: `${(plan.leftoverMm / plan.stockPanelWidthMm) * 100}%` }}
          title={`${millimetres(plan.leftoverMm)} leftover`}
        >
          {plan.leftoverMm >= 180 ? millimetres(plan.leftoverMm) : null}
        </div>
      ) : null}
    </div>
  );
}

function StockPanelCard({
  plan,
  panelNumber,
  selected,
  segmentOrdinalById,
  onSelect,
}: {
  plan: TwinBarOptimizationPlan;
  panelNumber: number;
  selected: boolean;
  segmentOrdinalById: Map<string, number>;
  onSelect: () => void;
}) {
  const utilization = plan.stockPanelWidthMm > 0 ? plan.consumedMm / plan.stockPanelWidthMm : 0;
  return (
    <article className={`panel-cut-card${selected ? " is-selected" : ""}`}>
      <header>
        <button type="button" onClick={onSelect}>
          <span>Stock panel {panelNumber}</span>
          <strong>
            {millimetres(plan.stockPanelWidthMm)} × {millimetres(plan.stockPanelHeightMm)}
          </strong>
        </button>
        <div>
          <span>{percentage(utilization)} used</span>
          <span>{millimetres(plan.leftoverMm)} left</span>
        </div>
      </header>
      <CutBar plan={plan} />
      <ol className="panel-cut-steps">
        {plan.cuts.map((cut) => (
          <li key={cut.id}>
            <span className="panel-cut-step-number">{cut.step}</span>
            <div>
              <strong>Cut {millimetres(cut.lengthMm)}</strong>
              <span>{cutLocation(cut, segmentOrdinalById)}</span>
            </div>
            <em>{cut.mode === "OPEN_STOCK_PANEL" ? "New panel" : "Use offcut"}</em>
          </li>
        ))}
      </ol>
      {plan.reusableLeftoverMm > 0 ? (
        <p className="panel-cut-reuse-note">
          Retain the final {millimetres(plan.reusableLeftoverMm)} offcut.
        </p>
      ) : null}
    </article>
  );
}

export function PanelCutPlan({
  summary,
  selectedPlanId,
  segmentOrdinalById,
  onSelectPlan,
}: PanelCutPlanProps) {
  const buckets = summary.twinBar.buckets.filter((bucket) => bucket.plans.length > 0);
  const selectedBucket =
    buckets.find((bucket) => bucket.plans.some((plan) => plan.id === selectedPlanId)) ??
    buckets[0] ??
    null;

  if (!selectedBucket) {
    return (
      <div className="panel-cut-empty">
        <h3>No cut panels required</h3>
        <p>Every run currently resolves to complete stock panels.</p>
      </div>
    );
  }

  return (
    <div className="panel-cut-plan">
      <aside className="panel-cut-groups" aria-label="Panel groups">
        <div className="panel-cut-summary">
          <span>Stock panels for cuts</span>
          <strong>{summary.twinBar.stockPanelsOpened}</strong>
          <small>
            {summary.twinBar.panelsSaved} saved · {percentage(summary.twinBar.utilizationRate)}{" "}
            utilisation
          </small>
        </div>
        {buckets.map((bucket) => (
          <button
            key={`${bucket.variant}-${bucket.stockPanelHeightMm}`}
            type="button"
            className={bucket === selectedBucket ? "is-active" : ""}
            onClick={() => bucket.plans[0] && onSelectPlan(bucket.plans[0].id)}
          >
            <span>{bucketLabel(bucket)}</span>
            <strong>
              {bucket.stockPanelsOpened} stock · {bucket.cutDemands} cuts
            </strong>
            <small>
              {bucket.panelsSaved} saved · {percentage(bucket.utilizationRate)} used
            </small>
          </button>
        ))}
      </aside>
      <section className="panel-cut-workspace">
        <div className="panel-cut-workspace-head">
          <div>
            <p>Cutting sheet</p>
            <h3>{bucketLabel(selectedBucket)}</h3>
            <span>
              Cut from left to right. Dashed gaps show the controlled 200mm reuse allowance.
            </span>
          </div>
          <button type="button" className="panel-cut-print" onClick={() => window.print()}>
            Print cut plan
          </button>
        </div>
        <div className="panel-cut-card-list">
          {selectedBucket.plans.map((plan, index) => (
            <StockPanelCard
              key={plan.id}
              plan={plan}
              panelNumber={index + 1}
              selected={plan.id === selectedPlanId || (selectedPlanId === null && index === 0)}
              segmentOrdinalById={segmentOrdinalById}
              onSelect={() => onSelectPlan(plan.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
