export interface PointMm {
  x: number;
  y: number;
}

export type FenceSystem = "TWIN_BAR" | "ROLL_FORM";
export const TWIN_BAR_HEIGHT_KEYS = ["1.2m", "1.8m", "2m", "2.4m", "3m", "4m", "4.5m", "5m", "6m"] as const;
export const ROLL_FORM_HEIGHT_KEYS = ["2m", "3m"] as const;
export const FENCE_HEIGHT_KEYS = ["1.2m", "1.8m", "2m", "2.4m", "3m", "4m", "4.5m", "5m", "6m"] as const;

export type TwinBarHeightKey = (typeof TWIN_BAR_HEIGHT_KEYS)[number];
export type RollFormHeightKey = (typeof ROLL_FORM_HEIGHT_KEYS)[number];
export type FenceHeightKey = (typeof FENCE_HEIGHT_KEYS)[number];
export type TwinBarVariant = "STANDARD" | "SUPER_REBOUND";

export interface FenceSpec {
  system: FenceSystem;
  height: FenceHeightKey;
  twinBarVariant?: TwinBarVariant | undefined;
}

export interface LayoutSegment {
  id: string;
  start: PointMm;
  end: PointMm;
  spec: FenceSpec;
}

export interface LayoutModel {
  segments: LayoutSegment[];
}

export interface SegmentEstimate {
  segmentId: string;
  lengthMm: number;
  bays: number;
  intermediatePosts: number;
  panels: number;
  roll2100: number;
  roll900: number;
}

export interface CornerSummary {
  total: number;
  internal: number;
  external: number;
  unclassified: number;
}

export interface MaterialSummary {
  twinBarPanels: number;
  twinBarPanelsSuperRebound: number;
  twinBarPanelsByStockHeightMm: Record<string, number>;
  twinBarPanelsByFenceHeight: Record<string, { standard: number; superRebound: number; total: number }>;
  roll2100: number;
  roll900: number;
  totalRolls: number;
  rollsByFenceHeight: Record<string, { roll2100: number; roll900: number; total: number }>;
}

export interface TwinBarCutSection {
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  lengthMm: number;
}

export interface TwinBarOptimizationCut {
  id: string;
  step: number;
  mode: "OPEN_STOCK_PANEL" | "REUSE_OFFCUT";
  demand: TwinBarCutSection;
  lengthMm: number;
  effectiveLengthMm: number;
  offcutBeforeMm: number;
  offcutAfterMm: number;
}

export interface TwinBarOptimizationPlan {
  id: string;
  variant: TwinBarVariant;
  stockPanelHeightMm: number;
  stockPanelWidthMm: number;
  cuts: TwinBarOptimizationCut[];
  consumedMm: number;
  leftoverMm: number;
  reusableLeftoverMm: number;
  reusedCuts: number;
  panelsSaved: number;
}

export interface TwinBarOptimizationBucket {
  variant: TwinBarVariant;
  stockPanelHeightMm: number;
  solver: "EXACT_SEARCH" | "BEST_FIT_DECREASING";
  fullPanels: number;
  cutDemands: number;
  stockPanelsOpened: number;
  reusedCuts: number;
  baselinePanels: number;
  optimizedPanels: number;
  panelsSaved: number;
  totalConsumedMm: number;
  totalLeftoverMm: number;
  reusableLeftoverMm: number;
  utilizationRate: number;
  plans: TwinBarOptimizationPlan[];
}

export interface OptimizationSummary {
  strategy: "CHAINED_CUT_PLANNER";
  twinBar: {
    reuseAllowanceMm: number;
    stockPanelWidthMm: number;
    fixedFullPanels: number;
    baselinePanels: number;
    optimizedPanels: number;
    panelsSaved: number;
    totalCutDemands: number;
    stockPanelsOpened: number;
    reusedCuts: number;
    totalConsumedMm: number;
    totalLeftoverMm: number;
    reusableLeftoverMm: number;
    utilizationRate: number;
    buckets: TwinBarOptimizationBucket[];
  };
}

export interface PostSummary {
  terminal: number;
  intermediate: number;
  total: number;
  cornerPosts: number;
  byHeightAndType: Record<
    string,
    {
      end: number;
      intermediate: number;
      corner: number;
      junction: number;
      inlineJoin: number;
      total: number;
    }
  >;
  byHeightMm: Record<string, number>;
}

export interface EstimateResult {
  posts: PostSummary;
  corners: CornerSummary;
  materials: MaterialSummary;
  optimization: OptimizationSummary;
  segments: SegmentEstimate[];
}

export interface EstimateSnapshot {
  id: string;
  createdAtIso: string;
  layout: LayoutModel;
  estimate: EstimateResult;
}
