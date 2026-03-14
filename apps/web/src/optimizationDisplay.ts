import type { OptimizationSummary, TwinBarOptimizationBucket, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

export interface VisibleOptimizationBucket extends TwinBarOptimizationBucket {
  plans: TwinBarOptimizationPlan[];
}

export function getVisibleOptimizationBuckets(summary: OptimizationSummary): VisibleOptimizationBucket[] {
  return summary.twinBar.buckets
    .map((bucket) => ({
      ...bucket,
      plans: bucket.plans
    }))
    .filter((bucket) => bucket.plans.length > 0);
}

export function getVisibleOptimizationPlans(summary: OptimizationSummary): TwinBarOptimizationPlan[] {
  return getVisibleOptimizationBuckets(summary).flatMap((bucket) => bucket.plans);
}
