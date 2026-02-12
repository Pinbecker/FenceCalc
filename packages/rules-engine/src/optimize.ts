import type {
  LayoutModel,
  TwinBarCutDemandDecision,
  OptimizationSummary,
  TwinBarCutSection,
  TwinBarOffcutTransfer,
  TwinBarOptimizationEntry,
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

interface OffcutPiece {
  id: string;
  availableMm: number;
  sourceCut: TwinBarCutSection;
  reuseStep: number;
}

function demandBucketKey(variant: TwinBarVariant, stockPanelHeightMm: number): string {
  return `${variant}:${stockPanelHeightMm}`;
}

const OFFCUT_REUSE_ALLOWANCE_MM = 200;

function takeLargestFit(offcuts: OffcutPiece[], requiredMm: number): { piece: OffcutPiece | null; candidateCount: number } {
  let bestIndex = -1;
  let bestLength = Number.NEGATIVE_INFINITY;
  let candidateCount = 0;

  for (let index = 0; index < offcuts.length; index += 1) {
    const candidate = offcuts[index];
    if (!candidate) {
      continue;
    }
    if (candidate.availableMm < requiredMm) {
      continue;
    }
    candidateCount += 1;
    if (candidate.availableMm > bestLength) {
      bestLength = candidate.availableMm;
      bestIndex = index;
    }
  }

  if (bestIndex < 0) {
    return { piece: null, candidateCount };
  }
  const [selected] = offcuts.splice(bestIndex, 1);
  return { piece: selected ?? null, candidateCount };
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

  const entries: TwinBarOptimizationEntry[] = [];
  const transfers: TwinBarOffcutTransfer[] = [];
  const demands: TwinBarCutDemandDecision[] = [];
  let transferId = 0;
  let demandDecisionId = 0;
  let offcutId = 0;

  for (const bucket of buckets.values()) {
    const offcuts: OffcutPiece[] = [];
    const cutDemands = [...bucket.cutDemands].sort((a, b) => a.lengthMm - b.lengthMm);

    let cutPiecesReused = 0;
    let cutPanelsOpened = 0;

    for (const demand of cutDemands) {
      const requiredWithAllowanceMm = demand.lengthMm + OFFCUT_REUSE_ALLOWANCE_MM;
      const { piece: reusedPiece, candidateCount } = takeLargestFit(offcuts, requiredWithAllowanceMm);
      const decisionId = `demand-${demandDecisionId}`;
      demandDecisionId += 1;

      if (reusedPiece !== null) {
        cutPiecesReused += 1;
        const remaining = Math.max(0, reusedPiece.availableMm - requiredWithAllowanceMm);
        const transferKey = `transfer-${transferId}`;

        transfers.push({
          id: transferKey,
          variant: bucket.variant,
          stockPanelHeightMm: bucket.stockPanelHeightMm,
          sourceOffcutId: reusedPiece.id,
          sourceReuseStep: reusedPiece.reuseStep + 1,
          source: reusedPiece.sourceCut,
          destination: demand,
          sourceOffcutLengthMm: reusedPiece.availableMm,
          sourceOffcutConsumedMm: requiredWithAllowanceMm,
          sourceOffcutRemainingMm: remaining,
          candidateSourceCount: candidateCount
        });
        if (remaining > OFFCUT_REUSE_ALLOWANCE_MM) {
          offcuts.push({
            id: reusedPiece.id,
            availableMm: remaining,
            sourceCut: reusedPiece.sourceCut,
            reuseStep: reusedPiece.reuseStep + 1
          });
        }
        demands.push({
          id: decisionId,
          variant: bucket.variant,
          stockPanelHeightMm: bucket.stockPanelHeightMm,
          demand,
          requiredLengthWithAllowanceMm: requiredWithAllowanceMm,
          candidateSourceCount: candidateCount,
          selectedTransferId: transferKey,
          status: "REUSED_OFFCUT"
        });
        transferId += 1;
        continue;
      }

      cutPanelsOpened += 1;
      const remaining = TWIN_BAR_PANEL_WIDTH_MM - demand.lengthMm;
      if (remaining > OFFCUT_REUSE_ALLOWANCE_MM) {
        offcuts.push({
          id: `offcut-${offcutId}`,
          availableMm: remaining,
          sourceCut: demand,
          reuseStep: 0
        });
        offcutId += 1;
      }
      demands.push({
        id: decisionId,
        variant: bucket.variant,
        stockPanelHeightMm: bucket.stockPanelHeightMm,
        demand,
        requiredLengthWithAllowanceMm: requiredWithAllowanceMm,
        candidateSourceCount: candidateCount,
        selectedTransferId: null,
        status: "OPEN_NEW_PANEL"
      });
    }

    const baselinePanels = bucket.fullPanels + cutDemands.length;
    const optimizedPanels = bucket.fullPanels + cutPanelsOpened;

    entries.push({
      variant: bucket.variant,
      stockPanelHeightMm: bucket.stockPanelHeightMm,
      fullPanels: bucket.fullPanels,
      cutPieces: cutDemands.length,
      cutPiecesReused,
      cutPanelsOpened,
      baselinePanels,
      optimizedPanels,
      panelsSaved: baselinePanels - optimizedPanels,
      offcutsRemainingCount: offcuts.length,
      offcutsRemainingLengthMm: offcuts.reduce((sum, value) => sum + value.availableMm, 0)
    });
  }

  entries.sort((left, right) => {
    if (left.variant !== right.variant) {
      return left.variant.localeCompare(right.variant);
    }
    return left.stockPanelHeightMm - right.stockPanelHeightMm;
  });

  const baselinePanels = entries.reduce((sum, entry) => sum + entry.baselinePanels, 0);
  const optimizedPanels = entries.reduce((sum, entry) => sum + entry.optimizedPanels, 0);

  return {
    strategy: "GREEDY_LARGEST_OFFCUT",
    twinBar: {
      reuseAllowanceMm: OFFCUT_REUSE_ALLOWANCE_MM,
      baselinePanels,
      optimizedPanels,
      panelsSaved: baselinePanels - optimizedPanels,
      entries,
      transfers,
      demands
    }
  };
}
