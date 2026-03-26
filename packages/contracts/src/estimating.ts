import type {
  DrawingCanvasViewport,
  EstimateResult,
  FenceHeightKey,
  FenceSystem,
  LayoutModel
} from "./domain.js";
import type { EstimateWorkbook, EstimateWorkbookManualEntry, PricingWorkbookConfig } from "./pricingWorkbook.js";
import { buildDefaultPricingWorkbookConfig } from "./pricingWorkbook.js";

export const PRICING_ITEM_CATEGORIES = [
  "PANELS",
  "POSTS",
  "GATES",
  "CONCRETE",
  "FLOODLIGHT_COLUMNS",
  "BASKETBALL_POSTS",
  "FIXINGS",
  "PLANT",
  "ANCILLARY"
] as const;

export type PricingItemCategory = (typeof PRICING_ITEM_CATEGORIES)[number];

export interface PricingItem {
  itemCode: string;
  displayName: string;
  category: PricingItemCategory;
  fenceSystem: FenceSystem;
  unit: string;
  materialCost: number;
  labourCost: number;
  isActive: boolean;
  notes?: string | undefined;
  sortOrder?: number | undefined;
}

export interface PricingConfigRecord {
  companyId: string;
  items: PricingItem[];
  workbook?: PricingWorkbookConfig | undefined;
  updatedAtIso: string;
  updatedByUserId: string | null;
}

export interface AncillaryEstimateItem {
  id: string;
  description: string;
  quantity: number;
  materialCost: number;
  labourCost: number;
}

export interface ConcreteRule {
  heightKey: FenceHeightKey;
  depthMm: number;
  widthMm: number;
  lengthMm: number;
}

export interface EstimateRow {
  key: string;
  itemCode: string | null;
  itemName: string;
  category: PricingItemCategory;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLabourCost: number;
  totalMaterialCost: number;
  totalLabourCost: number;
  totalCost: number;
  notes?: string | undefined;
}

export interface EstimateGroup {
  key: string;
  title: string;
  rows: EstimateRow[];
  subtotalMaterialCost: number;
  subtotalLabourCost: number;
  subtotalCost: number;
}

export interface EstimateTotals {
  materialCost: number;
  labourCost: number;
  totalCost: number;
}

export type EstimateWarningCode =
  | "UNSUPPORTED_FENCE_SYSTEM"
  | "INLINE_JOIN_OR_JUNCTION_POSTS"
  | "UNCLASSIFIED_CORNERS"
  | "CUSTOM_GATES"
  | "FIXINGS_EXCLUDED";

export interface EstimateWarning {
  code: EstimateWarningCode;
  message: string;
}

export interface EstimatePricingSnapshot {
  updatedAtIso: string;
  updatedByUserId: string | null;
  source: "DEFAULT" | "COMPANY_CONFIG";
}

export interface DrawingEstimateInput {
  drawingId: string;
  drawingName: string;
  customerId: string | null;
  customerName: string;
}

export interface PricedEstimateResult {
  drawing: DrawingEstimateInput;
  groups: EstimateGroup[];
  ancillaryItems: AncillaryEstimateItem[];
  manualEntries?: EstimateWorkbookManualEntry[] | undefined;
  workbook?: EstimateWorkbook | undefined;
  totals: EstimateTotals;
  warnings: EstimateWarning[];
  pricingSnapshot: EstimatePricingSnapshot;
}

export interface QuoteDrawingSnapshot {
  drawingId: string;
  drawingName: string;
  customerId: string | null;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  versionNumber: number;
}

export interface QuoteRecord {
  id: string;
  companyId: string;
  drawingId: string;
  drawingVersionNumber: number;
  pricedEstimate: PricedEstimateResult;
  drawingSnapshot: QuoteDrawingSnapshot;
  createdByUserId: string;
  createdAtIso: string;
}

function buildPanelItem(height: FenceHeightKey, sortOrder: number): PricingItem {
  return {
    itemCode: `TWIN_BAR_PANEL_${height.replace(".", "_").replace("m", "M")}`,
    displayName: `Twin Bar panel ${height}`,
    category: "PANELS",
    fenceSystem: "TWIN_BAR",
    unit: "panel",
    materialCost: 0,
    labourCost: 0,
    isActive: true,
    sortOrder
  };
}

function buildDefaultPricingItems(): PricingItem[] {
  const items: PricingItem[] = [];
  let sortOrder = 10;

  (["1.2m", "1.8m", "2m", "2.4m", "3m", "4m", "4.5m", "5m", "6m"] as FenceHeightKey[]).forEach((height) => {
    items.push(buildPanelItem(height, sortOrder));
    sortOrder += 10;
  });

  items.push(
    {
      itemCode: "TWIN_BAR_POST_INTERMEDIATE",
      displayName: "Twin Bar intermediate post",
      category: "POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "post",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_POST_END",
      displayName: "Twin Bar end post",
      category: "POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "post",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_POST_CORNER_INTERNAL",
      displayName: "Twin Bar corner post internal",
      category: "POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "post",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_POST_CORNER_EXTERNAL",
      displayName: "Twin Bar corner post external",
      category: "POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "post",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_GATE_SINGLE_LEAF_LEAF",
      displayName: "Single leaf gate leaf",
      category: "GATES",
      fenceSystem: "TWIN_BAR",
      unit: "leaf",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_GATE_SINGLE_LEAF_POSTS",
      displayName: "Single leaf gate posts",
      category: "GATES",
      fenceSystem: "TWIN_BAR",
      unit: "set",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_GATE_DOUBLE_LEAF_LEAVES",
      displayName: "Double leaf gate leaves",
      category: "GATES",
      fenceSystem: "TWIN_BAR",
      unit: "leaf",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_GATE_DOUBLE_LEAF_POSTS",
      displayName: "Double leaf gate posts",
      category: "GATES",
      fenceSystem: "TWIN_BAR",
      unit: "set",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_FENCE_CONCRETE",
      displayName: "Twin Bar fence concrete",
      category: "CONCRETE",
      fenceSystem: "TWIN_BAR",
      unit: "m3",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN",
      displayName: "Floodlight column",
      category: "FLOODLIGHT_COLUMNS",
      fenceSystem: "TWIN_BAR",
      unit: "column",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_CONCRETE",
      displayName: "Floodlight column concrete",
      category: "FLOODLIGHT_COLUMNS",
      fenceSystem: "TWIN_BAR",
      unit: "m3",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_BOLTS",
      displayName: "Floodlight column bolts",
      category: "FLOODLIGHT_COLUMNS",
      fenceSystem: "TWIN_BAR",
      unit: "bolt",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_FLOODLIGHT_COLUMN_CHEMFIX",
      displayName: "Floodlight column chemfix",
      category: "FLOODLIGHT_COLUMNS",
      fenceSystem: "TWIN_BAR",
      unit: "tube",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_BASKETBALL_POST",
      displayName: "Basketball post",
      category: "BASKETBALL_POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "post",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_BASKETBALL_POST_CONCRETE",
      displayName: "Basketball post concrete",
      category: "BASKETBALL_POSTS",
      fenceSystem: "TWIN_BAR",
      unit: "m3",
      materialCost: 0,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    },
    {
      itemCode: "TWIN_BAR_GENERAL_PLANT",
      displayName: "General plant",
      category: "PLANT",
      fenceSystem: "TWIN_BAR",
      unit: "item",
      materialCost: 700,
      labourCost: 0,
      isActive: true,
      sortOrder: sortOrder += 10
    }
  );

  return items;
}

export function buildDefaultPricingConfig(companyId = "", updatedByUserId: string | null = null): PricingConfigRecord {
  return {
    companyId,
    items: buildDefaultPricingItems(),
    workbook: buildDefaultPricingWorkbookConfig(),
    updatedAtIso: new Date(0).toISOString(),
    updatedByUserId
  };
}
