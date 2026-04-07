import type { EstimateResult, GatePlacement } from "@fence-estimator/contracts";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment,
} from "@fence-estimator/rules-engine";

import type {
  HeightCountRow,
  HeightLabelCountRow,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
} from "./types.js";

interface PostHeightRow {
  heightMm: number;
  end: number;
  intermediate: number;
  corner: number;
  junction: number;
  inlineJoin: number;
  total: number;
}

interface ResolvedGateSummary {
  gateType: GatePlacement["gateType"];
  leafCount: 1 | 2;
  spec: {
    height: string;
  };
}

interface FenceHeightPanelRow {
  height: string;
  standard: number;
  superRebound: number;
  total: number;
}

interface SavedPanelContext {
  savedByFenceHeightAndVariant: Map<string, number>;
  savedGroundPanelsBySegmentId: Map<string, number>;
}

export interface EditorSummaryData {
  postRowsByType: {
    end: HeightCountRow[];
    intermediate: HeightCountRow[];
    corner: HeightCountRow[];
    junction: HeightCountRow[];
    inlineJoin: HeightCountRow[];
  };
  gateCounts: {
    total: number;
    single: number;
    double: number;
    custom: number;
  };
  gateCountsByHeight: {
    single: HeightLabelCountRow[];
    double: HeightLabelCountRow[];
    custom: HeightLabelCountRow[];
  };
  basketballPostCountsByHeight: HeightLabelCountRow[];
  floodlightColumnCountsByHeight: HeightLabelCountRow[];
  twinBarFenceRows: FenceHeightPanelRow[];
  panelCount: number;
  featureCounts: {
    goalUnits: number;
    kickboards: number;
    pitchDividers: number;
    sideNettings: number;
  };
  featureRowsByKind: {
    goalUnits: Array<{ label: string; value: string }>;
    kickboards: Array<{ label: string; value: string }>;
    pitchDividers: Array<{ label: string; value: string }>;
    sideNettings: Array<{ label: string; value: string }>;
  };
}

function formatFeatureQuantity(value: number, unit: string): string {
  const normalized = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, "");
  return `${normalized} ${unit}`;
}

function roundMetric(value: number): number {
  return Number(Number.isInteger(value) ? value : value.toFixed(2));
}

function buildHeightRows(counts: Map<string, number>): HeightLabelCountRow[] {
  return [...counts.entries()]
    .map(([height, count]) => ({ height, count }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));
}

function buildSavedPanelContext(estimate: EstimateResult): SavedPanelContext {
  const savedByFenceHeightAndVariant = new Map<string, number>();
  const savedGroundPanelsBySegmentId = new Map<string, number>();

  const incrementSaved = (
    map: Map<string, number>,
    key: string,
    amount: number = 1,
  ): void => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };

  for (const bucket of estimate.optimization.twinBar.buckets) {
    for (const plan of bucket.plans) {
      for (const cut of plan.cuts) {
        if (cut.mode !== "REUSE_OFFCUT") {
          continue;
        }
        const fenceHeightKey = cut.demand.fenceHeightKey;
        if (fenceHeightKey) {
          incrementSaved(
            savedByFenceHeightAndVariant,
            `${fenceHeightKey}:${bucket.variant}`,
          );
        }
        if (cut.demand.lift === "GROUND") {
          incrementSaved(savedGroundPanelsBySegmentId, cut.demand.segmentId);
        }
      }
    }
  }

  return {
    savedByFenceHeightAndVariant,
    savedGroundPanelsBySegmentId,
  };
}

function buildAdjustedFenceRows(estimate: EstimateResult): {
  rows: FenceHeightPanelRow[];
  panelCount: number;
  savedGroundPanelsBySegmentId: Map<string, number>;
} {
  const { savedByFenceHeightAndVariant, savedGroundPanelsBySegmentId } =
    buildSavedPanelContext(estimate);

  const rows = Object.entries(estimate.materials.twinBarPanelsByFenceHeight)
    .map(([height, counts]) => {
      const savedStandard = savedByFenceHeightAndVariant.get(`${height}:STANDARD`) ?? 0;
      const savedSuperRebound = savedByFenceHeightAndVariant.get(`${height}:SUPER_REBOUND`) ?? 0;
      const standard = Math.max(0, counts.standard - savedStandard);
      const superRebound = Math.max(0, counts.superRebound - savedSuperRebound);
      return {
        height,
        standard,
        superRebound,
        total: standard + superRebound,
      };
    })
    .filter((row) => row.total > 0)
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

  return {
    rows,
    panelCount: rows.reduce((sum, row) => sum + row.total, 0),
    savedGroundPanelsBySegmentId,
  };
}

function buildGateCountsByHeight(
  gates: ResolvedGateSummary[],
  gateType: GatePlacement["gateType"],
): HeightLabelCountRow[] {
  const counts = gates.reduce<Map<string, number>>((map, gate) => {
    if (gate.gateType !== gateType) {
      return map;
    }
    map.set(gate.spec.height, (map.get(gate.spec.height) ?? 0) + 1);
    return map;
  }, new Map());

  return buildHeightRows(counts);
}

export function buildEditorSummaryData(input: {
  postHeightRows: PostHeightRow[];
  resolvedGatePlacements: ResolvedGateSummary[];
  resolvedBasketballPostPlacements: ResolvedBasketballPostPlacement[];
  resolvedFloodlightColumnPlacements: ResolvedFloodlightColumnPlacement[];
  resolvedGoalUnits: ResolvedGoalUnitPlacement[];
  resolvedKickboards: ResolvedKickboardAttachment[];
  resolvedPitchDividers: ResolvedPitchDividerPlacement[];
  resolvedSideNettings: ResolvedSideNettingAttachment[];
  estimate: EstimateResult;
}): EditorSummaryData {
  const rowsForType = (
    typeKey: "end" | "intermediate" | "corner" | "junction" | "inlineJoin",
  ) =>
    input.postHeightRows
      .filter((row) => row[typeKey] > 0)
      .map((row) => ({ heightMm: row.heightMm, count: row[typeKey] }));

  let single = 0;
  let double = 0;
  let custom = 0;

  for (const gate of input.resolvedGatePlacements) {
    if (gate.gateType === "CUSTOM") {
      custom += 1;
    }
    if (gate.leafCount === 2) {
      double += 1;
    } else {
      single += 1;
    }
  }

  const basketballPostCountsByHeight = buildHeightRows(
    input.resolvedBasketballPostPlacements.reduce<Map<string, number>>((map, basketballPost) => {
      map.set(
        basketballPost.spec.height,
        (map.get(basketballPost.spec.height) ?? 0) + 1,
      );
      return map;
    }, new Map()),
  );

  const floodlightColumnCountsByHeight = buildHeightRows(
    input.resolvedFloodlightColumnPlacements.reduce<Map<string, number>>(
      (map, floodlightColumn) => {
        map.set(
          floodlightColumn.spec.height,
          (map.get(floodlightColumn.spec.height) ?? 0) + 1,
        );
        return map;
      },
      new Map(),
    ),
  );

  const { rows: twinBarFenceRows, panelCount, savedGroundPanelsBySegmentId } =
    buildAdjustedFenceRows(input.estimate);

  const resolvedKickboardsByAttachmentId = new Map<
    string,
    (typeof input.resolvedKickboards)[number]
  >();
  for (const kickboard of input.resolvedKickboards) {
    const existing = resolvedKickboardsByAttachmentId.get(kickboard.sourceAttachmentId);
    if (!existing || kickboard.boardCount > existing.boardCount) {
      resolvedKickboardsByAttachmentId.set(kickboard.sourceAttachmentId, kickboard);
    }
  }

  const kickboardRows = [...resolvedKickboardsByAttachmentId.values()]
    .reduce<
      Map<
        string,
        {
          label: string;
          quantity: number;
        }
      >
    >((map, kickboard) => {
      const savedBoards = savedGroundPanelsBySegmentId.get(kickboard.segmentId) ?? 0;
      const adjustedBoardCount = Math.max(0, kickboard.boardCount - savedBoards);
      const key = `${kickboard.placement.sectionHeightMm}:${kickboard.placement.profile}`;
      const existing = map.get(key);
      const label = `${kickboard.placement.sectionHeightMm} x ${kickboard.placement.thicknessMm} ${kickboard.placement.profile.toLowerCase()} kickboards`;
      if (existing) {
        existing.quantity += adjustedBoardCount;
      } else {
        map.set(key, { label, quantity: adjustedBoardCount });
      }
      return map;
    }, new Map())
    .values();

  const kickboardRowsByKind = [...kickboardRows]
    .filter((row) => row.quantity > 0)
    .sort((left, right) => left.label.localeCompare(right.label, "en-GB", { numeric: true }))
    .map((row) => ({
      label: row.label,
      value: formatFeatureQuantity(row.quantity, "board"),
    }));

  const sideNettingLengthRows = [...input.resolvedSideNettings.reduce<Map<number, number>>((map, sideNetting) => {
    map.set(
      sideNetting.additionalHeightMm,
      (map.get(sideNetting.additionalHeightMm) ?? 0) + sideNetting.lengthMm / 1000,
    );
    return map;
  }, new Map()).entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([additionalHeightMm, totalLengthM]) => ({
      label: `+${additionalHeightMm}mm side netting`,
      value: formatFeatureQuantity(totalLengthM, "m"),
    }));

  const totalSideNettingAreaM2 = input.resolvedSideNettings.reduce(
    (sum, sideNetting) =>
      sum + (sideNetting.lengthMm / 1000) * (sideNetting.additionalHeightMm / 1000),
    0,
  );

  const featureRowsByKind = {
    goalUnits: input.resolvedGoalUnits
      .map((goalUnit) => ({
        label: `Goal unit ${goalUnit.widthMm / 1000}m x ${goalUnit.goalHeightMm / 1000}m`,
        value: "1 item",
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "en-GB", { numeric: true })),
    kickboards: kickboardRowsByKind,
    pitchDividers: input.resolvedPitchDividers
      .filter((divider) => divider.isValid)
      .map((divider, index) => ({
        label: `Pitch divider ${index + 1}`,
        value: formatFeatureQuantity(divider.spanMm / 1000, "m"),
      })),
    sideNettings: [
      ...sideNettingLengthRows,
      ...(totalSideNettingAreaM2 > 0
        ? [
            {
              label: "Total netting area",
              value: formatFeatureQuantity(totalSideNettingAreaM2, "m2"),
            },
          ]
        : []),
    ],
  };

  return {
    postRowsByType: {
      end: rowsForType("end"),
      intermediate: rowsForType("intermediate"),
      corner: rowsForType("corner"),
      junction: rowsForType("junction"),
      inlineJoin: rowsForType("inlineJoin"),
    },
    gateCounts: {
      total: input.resolvedGatePlacements.length,
      single,
      double,
      custom,
    },
    gateCountsByHeight: {
      single: buildGateCountsByHeight(input.resolvedGatePlacements, "SINGLE_LEAF"),
      double: buildGateCountsByHeight(input.resolvedGatePlacements, "DOUBLE_LEAF"),
      custom: buildGateCountsByHeight(input.resolvedGatePlacements, "CUSTOM"),
    },
    basketballPostCountsByHeight,
    floodlightColumnCountsByHeight,
    twinBarFenceRows,
    panelCount,
    featureCounts: {
      goalUnits: input.resolvedGoalUnits.length,
      kickboards: kickboardRowsByKind.reduce((sum, row) => {
        const numeric = Number.parseFloat(row.value);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
      }, 0),
      pitchDividers: input.resolvedPitchDividers.filter((divider) => divider.isValid).length,
      sideNettings: roundMetric(totalSideNettingAreaM2),
    },
    featureRowsByKind,
  };
}
