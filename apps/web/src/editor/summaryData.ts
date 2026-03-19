import type { EstimateResult, GatePlacement } from "@fence-estimator/contracts";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";

import type {
  HeightCountRow,
  HeightLabelCountRow,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement
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
  gateCountsByHeight: HeightLabelCountRow[];
  basketballPostCountsByHeight: HeightLabelCountRow[];
  floodlightColumnCountsByHeight: HeightLabelCountRow[];
  twinBarFenceRows: Array<{ height: string; standard: number; superRebound: number }>;
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
  const normalized = Number.isInteger(value) ? value.toString() : value.toFixed(3).replace(/\.?0+$/, "");
  return `${normalized} ${unit}`;
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
  const rowsForType = (typeKey: "end" | "intermediate" | "corner" | "junction" | "inlineJoin") =>
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

  const gateCountsByHeight = [...input.resolvedGatePlacements.reduce<Map<string, number>>((map, gate) => {
    map.set(gate.spec.height, (map.get(gate.spec.height) ?? 0) + 1);
    return map;
  }, new Map())]
    .map(([height, count]) => ({ height, count }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

  const basketballPostCountsByHeight = [...input.resolvedBasketballPostPlacements.reduce<Map<string, number>>((map, basketballPost) => {
    map.set(basketballPost.spec.height, (map.get(basketballPost.spec.height) ?? 0) + 1);
    return map;
  }, new Map())]
    .map(([height, count]) => ({ height, count }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

  const floodlightColumnCountsByHeight = [...input.resolvedFloodlightColumnPlacements.reduce<Map<string, number>>((map, floodlightColumn) => {
    map.set(floodlightColumn.spec.height, (map.get(floodlightColumn.spec.height) ?? 0) + 1);
    return map;
  }, new Map())]
    .map(([height, count]) => ({ height, count }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

  const twinBarFenceRows = Object.entries(input.estimate.materials.twinBarPanelsByFenceHeight)
    .map(([height, counts]) => ({ height, ...counts }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

  const featureRowsByKind = {
    goalUnits: (input.estimate.featureQuantities ?? [])
      .filter((line) => line.kind === "GOAL_UNIT" || (line.kind === "BASKETBALL" && line.component === "GOAL_UNIT_INTEGRATED"))
      .map((line) => ({ label: line.description, value: formatFeatureQuantity(line.quantity, line.unit) })),
    kickboards: (input.estimate.featureQuantities ?? [])
      .filter((line) => line.kind === "KICKBOARD")
      .map((line) => ({ label: line.description, value: formatFeatureQuantity(line.quantity, line.unit) })),
    pitchDividers: (input.estimate.featureQuantities ?? [])
      .filter((line) => line.kind === "PITCH_DIVIDER")
      .map((line) => ({ label: line.description, value: formatFeatureQuantity(line.quantity, line.unit) })),
    sideNettings: (input.estimate.featureQuantities ?? [])
      .filter((line) => line.kind === "SIDE_NETTING")
      .map((line) => ({ label: line.description, value: formatFeatureQuantity(line.quantity, line.unit) }))
  };

  return {
    postRowsByType: {
      end: rowsForType("end"),
      intermediate: rowsForType("intermediate"),
      corner: rowsForType("corner"),
      junction: rowsForType("junction"),
      inlineJoin: rowsForType("inlineJoin")
    },
    gateCounts: {
      total: input.resolvedGatePlacements.length,
      single,
      double,
      custom
    },
    gateCountsByHeight,
    basketballPostCountsByHeight,
    floodlightColumnCountsByHeight,
    twinBarFenceRows,
    featureCounts: {
      goalUnits: input.resolvedGoalUnits.length,
      kickboards: input.resolvedKickboards.length,
      pitchDividers: input.resolvedPitchDividers.length,
      sideNettings: input.resolvedSideNettings.length
    },
    featureRowsByKind
  };
}
