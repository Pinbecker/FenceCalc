import type {
  LayoutModel,
  OptimizationSummary,
  TwinBarCutSection,
  TwinBarOptimizationBucket,
  TwinBarOptimizationCut,
  TwinBarOptimizationPlan,
  TwinBarVariant
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { TWIN_BAR_PANEL_WIDTH_MM, getSpecConfig } from "./constants.js";

interface TwinBarDemandBucket {
  variant: TwinBarVariant;
  stockPanelHeightMm: number;
  fullPanels: number;
  cutDemands: TwinBarCutSection[];
}

interface DemandRecord {
  id: string;
  section: TwinBarCutSection;
  effectiveLengthMm: number;
}

interface PackedBin {
  itemIds: string[];
  usedMm: number;
}

interface PackedPlanSet {
  solver: TwinBarOptimizationBucket["solver"];
  bins: PackedBin[];
}

const OFFCUT_REUSE_ALLOWANCE_MM = 200;
const EXACT_SEARCH_LIMIT = 20;

function demandBucketKey(variant: TwinBarVariant, stockPanelHeightMm: number): string {
  return `${variant}:${stockPanelHeightMm}`;
}

function compareSections(left: TwinBarCutSection, right: TwinBarCutSection): number {
  if (left.lengthMm !== right.lengthMm) {
    return right.lengthMm - left.lengthMm;
  }
  if (left.segmentId !== right.segmentId) {
    return left.segmentId.localeCompare(right.segmentId);
  }
  if (left.startOffsetMm !== right.startOffsetMm) {
    return left.startOffsetMm - right.startOffsetMm;
  }
  return left.endOffsetMm - right.endOffsetMm;
}

function compareRemaindersDescending(left: PackedBin[], right: PackedBin[], capacityMm: number): number {
  const leftRemainders = left.map((bin) => capacityMm - bin.usedMm).sort((a, b) => b - a);
  const rightRemainders = right.map((bin) => capacityMm - bin.usedMm).sort((a, b) => b - a);
  const longest = Math.max(leftRemainders.length, rightRemainders.length);

  for (let index = 0; index < longest; index += 1) {
    const leftValue = leftRemainders[index] ?? Number.NEGATIVE_INFINITY;
    const rightValue = rightRemainders[index] ?? Number.NEGATIVE_INFINITY;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function cloneBins(bins: PackedBin[]): PackedBin[] {
  return bins.map((bin) => ({
    itemIds: [...bin.itemIds],
    usedMm: bin.usedMm
  }));
}

function placeBestFit(bins: PackedBin[], item: DemandRecord, capacityMm: number): boolean {
  let bestIndex = -1;
  let bestRemaining = Number.POSITIVE_INFINITY;

  for (let index = 0; index < bins.length; index += 1) {
    const bin = bins[index];
    if (!bin) {
      continue;
    }
    const nextUsed = bin.usedMm + item.effectiveLengthMm;
    if (nextUsed > capacityMm) {
      continue;
    }
    const remaining = capacityMm - nextUsed;
    if (remaining < bestRemaining) {
      bestRemaining = remaining;
      bestIndex = index;
    }
  }

  if (bestIndex < 0) {
    return false;
  }

  const target = bins[bestIndex];
  if (!target) {
    return false;
  }
  target.itemIds.push(item.id);
  target.usedMm += item.effectiveLengthMm;
  return true;
}

function packBestFitDecreasing(items: DemandRecord[], capacityMm: number): PackedBin[] {
  const bins: PackedBin[] = [];

  for (const item of items) {
    if (!placeBestFit(bins, item, capacityMm)) {
      bins.push({
        itemIds: [item.id],
        usedMm: item.effectiveLengthMm
      });
    }
  }

  return bins;
}

function attemptCollapseBins(itemsById: Map<string, DemandRecord>, bins: PackedBin[], capacityMm: number): PackedBin[] {
  const collapsed = cloneBins(bins);

  for (let index = 0; index < collapsed.length; index += 1) {
    const candidate = collapsed[index];
    if (!candidate || collapsed.length <= 1) {
      continue;
    }

    const remainingBins = collapsed.filter((_, currentIndex) => currentIndex !== index).map((bin) => ({
      itemIds: [...bin.itemIds],
      usedMm: bin.usedMm
    }));
    const items = candidate.itemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is DemandRecord => item !== undefined)
      .sort((left, right) => right.effectiveLengthMm - left.effectiveLengthMm);

    let fits = true;
    for (const item of items) {
      if (!placeBestFit(remainingBins, item, capacityMm)) {
        fits = false;
        break;
      }
    }

    if (!fits) {
      continue;
    }

    remainingBins.sort((left, right) => right.usedMm - left.usedMm);
    return attemptCollapseBins(itemsById, remainingBins, capacityMm);
  }

  collapsed.sort((left, right) => right.usedMm - left.usedMm);
  return collapsed;
}

function packExactly(items: DemandRecord[], capacityMm: number): PackedBin[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const suffixSums = new Array<number>(items.length + 1).fill(0);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    suffixSums[index] = (suffixSums[index + 1] ?? 0) + (items[index]?.effectiveLengthMm ?? 0);
  }

  let best = attemptCollapseBins(itemsById, packBestFitDecreasing(items, capacityMm), capacityMm);

  function search(index: number, bins: PackedBin[]): void {
    if (bins.length > best.length) {
      return;
    }

    const freeCapacityMm = bins.reduce((sum, bin) => sum + (capacityMm - bin.usedMm), 0);
    const remainingDemandMm = suffixSums[index] ?? 0;
    const deficitMm = Math.max(0, remainingDemandMm - freeCapacityMm);
    const lowerBound = bins.length + Math.ceil(deficitMm / capacityMm);
    if (lowerBound > best.length) {
      return;
    }

    if (index >= items.length) {
      if (
        bins.length < best.length ||
        (bins.length === best.length && compareRemaindersDescending(bins, best, capacityMm) > 0)
      ) {
        best = cloneBins(bins);
      }
      return;
    }

    const item = items[index];
    if (!item) {
      return;
    }

    const candidateBins = bins
      .map((bin, binIndex) => ({
        binIndex,
        remainingMm: capacityMm - (bin.usedMm + item.effectiveLengthMm)
      }))
      .filter((candidate) => candidate.remainingMm >= 0)
      .sort((left, right) => left.remainingMm - right.remainingMm);

    const seenRemaining = new Set<number>();
    for (const candidate of candidateBins) {
      if (seenRemaining.has(candidate.remainingMm)) {
        continue;
      }
      seenRemaining.add(candidate.remainingMm);
      const nextBins = cloneBins(bins);
      const target = nextBins[candidate.binIndex];
      if (!target) {
        continue;
      }
      target.itemIds.push(item.id);
      target.usedMm += item.effectiveLengthMm;
      search(index + 1, nextBins);
    }

    if (bins.length + 1 > best.length) {
      return;
    }

    const nextBins = cloneBins(bins);
    nextBins.push({
      itemIds: [item.id],
      usedMm: item.effectiveLengthMm
    });
    search(index + 1, nextBins);
  }

  search(0, []);
  best.sort((left, right) => right.usedMm - left.usedMm);
  return best;
}

function packDemands(items: DemandRecord[], capacityMm: number): PackedPlanSet {
  const sorted = [...items].sort((left, right) => {
    if (left.effectiveLengthMm !== right.effectiveLengthMm) {
      return right.effectiveLengthMm - left.effectiveLengthMm;
    }
    return compareSections(left.section, right.section);
  });

  const itemsById = new Map(sorted.map((item) => [item.id, item]));
  const heuristic = attemptCollapseBins(itemsById, packBestFitDecreasing(sorted, capacityMm), capacityMm);

  if (sorted.length > EXACT_SEARCH_LIMIT) {
    return {
      solver: "BEST_FIT_DECREASING",
      bins: heuristic
    };
  }

  return {
    solver: "EXACT_SEARCH",
    bins: packExactly(sorted, capacityMm)
  };
}

function buildPlan(
  bucket: TwinBarDemandBucket,
  itemIds: string[],
  demandById: Map<string, DemandRecord>,
  planId: string,
): TwinBarOptimizationPlan {
  const items = itemIds
    .map((itemId) => demandById.get(itemId))
    .filter((item): item is DemandRecord => item !== undefined)
    .sort((left, right) => compareSections(left.section, right.section));

  let offcutMm = TWIN_BAR_PANEL_WIDTH_MM;
  const cuts: TwinBarOptimizationCut[] = items.map((item, index) => {
    const consumedMm = index === 0 ? item.section.lengthMm : item.effectiveLengthMm;
    const cut: TwinBarOptimizationCut = {
      id: `${planId}-cut-${index + 1}`,
      step: index + 1,
      mode: index === 0 ? "OPEN_STOCK_PANEL" : "REUSE_OFFCUT",
      demand: item.section,
      lengthMm: item.section.lengthMm,
      effectiveLengthMm: item.effectiveLengthMm,
      offcutBeforeMm: offcutMm,
      offcutAfterMm: offcutMm - consumedMm
    };
    offcutMm = cut.offcutAfterMm;
    return cut;
  });

  const reusedCuts = Math.max(0, cuts.length - 1);
  const leftoverMm = Math.max(0, offcutMm);
  const consumedMm = TWIN_BAR_PANEL_WIDTH_MM - leftoverMm;

  return {
    id: planId,
    variant: bucket.variant,
    stockPanelHeightMm: bucket.stockPanelHeightMm,
    stockPanelWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    cuts,
    consumedMm,
    leftoverMm,
    reusableLeftoverMm: leftoverMm > OFFCUT_REUSE_ALLOWANCE_MM ? leftoverMm : 0,
    reusedCuts,
    panelsSaved: reusedCuts
  };
}

export function buildOptimizationSummary(layout: LayoutModel): OptimizationSummary {
  const buckets = new Map<string, TwinBarDemandBucket>();

  for (const segment of layout.segments) {
    if (segment.spec.system !== "TWIN_BAR") {
      continue;
    }
    const config = getSpecConfig(segment.spec);
    const variant = segment.spec.twinBarVariant ?? "STANDARD";
    const segmentLengthMm = Math.round(distanceMm(segment.start, segment.end));
    const fullPanels = Math.floor(segmentLengthMm / TWIN_BAR_PANEL_WIDTH_MM);
    const cutPieceMm = segmentLengthMm % TWIN_BAR_PANEL_WIDTH_MM;

    for (const layer of config.layers) {
      const key = demandBucketKey(variant, layer.heightMm);
      const existing = buckets.get(key);
      const bucket = existing ?? {
        variant,
        stockPanelHeightMm: layer.heightMm,
        fullPanels: 0,
        cutDemands: []
      };

      bucket.fullPanels += fullPanels;
      if (cutPieceMm > 0) {
        bucket.cutDemands.push({
          segmentId: segment.id,
          startOffsetMm: fullPanels * TWIN_BAR_PANEL_WIDTH_MM,
          endOffsetMm: segmentLengthMm,
          lengthMm: cutPieceMm
        });
      }
      if (!existing) {
        buckets.set(key, bucket);
      }
    }
  }

  const capacityMm = TWIN_BAR_PANEL_WIDTH_MM + OFFCUT_REUSE_ALLOWANCE_MM;
  const optimizationBuckets: TwinBarOptimizationBucket[] = [];
  let fixedFullPanels = 0;
  let totalCutDemands = 0;
  let stockPanelsOpened = 0;
  let reusedCuts = 0;
  let totalConsumedMm = 0;
  let totalLeftoverMm = 0;
  let reusableLeftoverMm = 0;

  for (const bucket of buckets.values()) {
    fixedFullPanels += bucket.fullPanels;
    if (bucket.cutDemands.length === 0) {
      continue;
    }

    const demandRecords = bucket.cutDemands.map((section, index) => ({
      id: `${bucket.variant}-${bucket.stockPanelHeightMm}-demand-${index}`,
      section,
      effectiveLengthMm: section.lengthMm + OFFCUT_REUSE_ALLOWANCE_MM
    }));
    const demandById = new Map(demandRecords.map((record) => [record.id, record]));
    const packed = packDemands(demandRecords, capacityMm);
    const plans = packed.bins
      .map((bin, index) => buildPlan(bucket, bin.itemIds, demandById, `${bucket.variant}-${bucket.stockPanelHeightMm}-plan-${index + 1}`))
      .sort((left, right) => {
        if (left.panelsSaved !== right.panelsSaved) {
          return right.panelsSaved - left.panelsSaved;
        }
        if (left.leftoverMm !== right.leftoverMm) {
          return right.leftoverMm - left.leftoverMm;
        }
        return left.id.localeCompare(right.id);
      });

    const bucketReusedCuts = plans.reduce((sum, plan) => sum + plan.reusedCuts, 0);
    const bucketConsumedMm = plans.reduce((sum, plan) => sum + plan.consumedMm, 0);
    const bucketLeftoverMm = plans.reduce((sum, plan) => sum + plan.leftoverMm, 0);
    const bucketReusableLeftoverMm = plans.reduce((sum, plan) => sum + plan.reusableLeftoverMm, 0);
    const stockPanelsForCuts = plans.length;

    optimizationBuckets.push({
      variant: bucket.variant,
      stockPanelHeightMm: bucket.stockPanelHeightMm,
      solver: packed.solver,
      fullPanels: bucket.fullPanels,
      cutDemands: bucket.cutDemands.length,
      stockPanelsOpened: stockPanelsForCuts,
      reusedCuts: bucketReusedCuts,
      baselinePanels: bucket.fullPanels + bucket.cutDemands.length,
      optimizedPanels: bucket.fullPanels + stockPanelsForCuts,
      panelsSaved: bucket.cutDemands.length - stockPanelsForCuts,
      totalConsumedMm: bucketConsumedMm,
      totalLeftoverMm: bucketLeftoverMm,
      reusableLeftoverMm: bucketReusableLeftoverMm,
      utilizationRate: stockPanelsForCuts > 0 ? bucketConsumedMm / (stockPanelsForCuts * TWIN_BAR_PANEL_WIDTH_MM) : 0,
      plans
    });

    totalCutDemands += bucket.cutDemands.length;
    stockPanelsOpened += stockPanelsForCuts;
    reusedCuts += bucketReusedCuts;
    totalConsumedMm += bucketConsumedMm;
    totalLeftoverMm += bucketLeftoverMm;
    reusableLeftoverMm += bucketReusableLeftoverMm;
  }

  optimizationBuckets.sort((left, right) => {
    if (left.variant !== right.variant) {
      return left.variant.localeCompare(right.variant);
    }
    return left.stockPanelHeightMm - right.stockPanelHeightMm;
  });

  return {
    strategy: "CHAINED_CUT_PLANNER",
    twinBar: {
      reuseAllowanceMm: OFFCUT_REUSE_ALLOWANCE_MM,
      stockPanelWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
      fixedFullPanels,
      baselinePanels: fixedFullPanels + totalCutDemands,
      optimizedPanels: fixedFullPanels + stockPanelsOpened,
      panelsSaved: totalCutDemands - stockPanelsOpened,
      totalCutDemands,
      stockPanelsOpened,
      reusedCuts,
      totalConsumedMm,
      totalLeftoverMm,
      reusableLeftoverMm,
      utilizationRate: stockPanelsOpened > 0 ? totalConsumedMm / (stockPanelsOpened * TWIN_BAR_PANEL_WIDTH_MM) : 0,
      buckets: optimizationBuckets
    }
  };
}
