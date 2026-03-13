import type { EstimateResult, GatePlacement } from "@fence-estimator/contracts";

import type { HeightCountRow, HeightLabelCountRow, ResolvedBasketballPostPlacement } from "./types.js";

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
  twinBarFenceRows: Array<{ height: string; standard: number; superRebound: number }>;
}

export function buildEditorSummaryData(input: {
  postHeightRows: PostHeightRow[];
  resolvedGatePlacements: ResolvedGateSummary[];
  resolvedBasketballPostPlacements: ResolvedBasketballPostPlacement[];
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

  const twinBarFenceRows = Object.entries(input.estimate.materials.twinBarPanelsByFenceHeight)
    .map(([height, counts]) => ({ height, ...counts }))
    .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height));

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
    twinBarFenceRows
  };
}
