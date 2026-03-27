import type { FenceHeightKey, FeatureQuantityKind, GateType, JobCommercialInputs, TwinBarVariant } from "./domain.js";

export const PRICING_WORKBOOK_SHEETS = ["MATERIALS", "LABOUR"] as const;
export type PricingWorkbookSheet = (typeof PRICING_WORKBOOK_SHEETS)[number];

export const INSTALL_LIFT_LEVELS = ["GROUND", "FIRST", "SECOND"] as const;
export type InstallLiftLevel = (typeof INSTALL_LIFT_LEVELS)[number];

export const PRICING_WORKBOOK_RATE_MODES = ["MONEY", "REFERENCE", "VOLUME_PER_UNIT"] as const;
export type PricingWorkbookRateMode = (typeof PRICING_WORKBOOK_RATE_MODES)[number];

export interface PricingWorkbookSettings {
  labourOverheadPercent: number;
  travelLodgePerDay: number;
  markupRate: number;
  distributionCharge: number;
  concretePricePerCube: number;
  hardDigDefault: boolean;
  clearSpoilsDefault: boolean;
  colourOption: string;
}

export type PricingWorkbookQuantityRule =
  | { kind: "MANUAL_ENTRY"; defaultQuantity?: number | undefined }
  | { kind: "PANEL_COUNT"; heightKey: FenceHeightKey; variant: "STANDARD" | "SUPER_REBOUND" | "TOTAL" }
  | {
      kind: "PANEL_LAYER_COUNT";
      panelHeightMm: number;
      variant: "STANDARD" | "SUPER_REBOUND" | "TOTAL";
      lift?: InstallLiftLevel | undefined;
    }
  | {
      kind: "POST_COUNT";
      heightMm: number;
      postType: "end" | "intermediate" | "corner" | "junction" | "inlineJoin" | "total";
    }
  | { kind: "CORNER_COUNT"; heightMm: number; cornerType: "internal" | "external" | "unclassified" | "total" }
  | { kind: "TOP_RAIL_COUNT"; heightKey: FenceHeightKey }
  | { kind: "GATE_COUNT"; heightKey: FenceHeightKey; gateType: GateType; output: "gate" | "leaf" | "post_set" }
  | {
      kind: "GATE_COUNT_BUCKET";
      heightBucket: "UP_TO_4M" | "AT_LEAST_4_5M";
      gateType: Exclude<GateType, "CUSTOM">;
    }
  | { kind: "FEATURE_QUANTITY"; featureKind: FeatureQuantityKind; component: string }
  | { kind: "FLOODLIGHT_COLUMN_COUNT" }
  | { kind: "TOTAL_POSTS_BY_HEIGHT"; heightMm: number }
  | { kind: "TOTAL_POSTS" };

export interface PricingWorkbookRow {
  code: string;
  label: string;
  unit: string;
  rate: number;
  rateMode?: PricingWorkbookRateMode | undefined;
  quantityRule: PricingWorkbookQuantityRule;
  notes?: string | undefined;
  tone?: "default" | "highlight" | "manual" | "warning" | undefined;
}

export interface PricingWorkbookSection {
  key: string;
  sheet: PricingWorkbookSheet;
  title: string;
  caption?: string | undefined;
  rows: PricingWorkbookRow[];
}

export interface PricingWorkbookConfig {
  settings: PricingWorkbookSettings;
  sections: PricingWorkbookSection[];
}

export interface EstimateWorkbookManualEntry {
  code: string;
  quantity: number;
}

export interface EstimateWorkbookCommercialInputs {
  travelDays: number;
  markupUnits: number;
}

export interface EstimateWorkbookRow {
  code: string;
  label: string;
  unit: string;
  quantity: number;
  rate: number;
  rateMode: PricingWorkbookRateMode;
  total: number;
  isEditable: boolean;
  notes?: string | undefined;
  tone?: "default" | "highlight" | "manual" | "warning" | undefined;
}

export interface EstimateWorkbookSection {
  key: string;
  sheet: PricingWorkbookSheet;
  title: string;
  caption?: string | undefined;
  subtotal: number;
  rows: EstimateWorkbookRow[];
}

export interface EstimateWorkbookTotals {
  materialsSubtotal: number;
  labourSubtotal: number;
  labourOverheadPercent: number;
  labourOverheadAmount: number;
  distributionCharge: number;
  travelDays: number;
  travelRatePerDay: number;
  travelTotal: number;
  markupUnits: number;
  markupRate: number;
  markupTotal: number;
  grandTotal: number;
}

export interface EstimateWorkbook {
  settings: PricingWorkbookSettings;
  sections: EstimateWorkbookSection[];
  manualEntries: EstimateWorkbookManualEntry[];
  commercialInputs: EstimateWorkbookCommercialInputs;
  totals: EstimateWorkbookTotals;
}

function buildHeightMaterialSections(): PricingWorkbookSection[] {
  return [
    {
      key: "materials-height-1200",
      sheet: "MATERIALS",
      title: "1.20m height",
      caption: "Spectator / rebound reference block",
      rows: [
        {
          code: "MAT_REF_1200_REBOUND_PANELS",
          label: "Rebound panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "PANEL_COUNT", heightKey: "1.2m", variant: "SUPER_REBOUND" }
        },
        {
          code: "MAT_1200_CORNERS_80X80X3",
          label: "Corners 80x80x3",
          unit: "post",
          rate: 71.53,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 1200, cornerType: "total" }
        },
        {
          code: "MAT_1200_ENDS_60X60X3",
          label: "Ends 60x60x3",
          unit: "post",
          rate: 39.21,
          quantityRule: { kind: "POST_COUNT", heightMm: 1200, postType: "end" }
        },
        {
          code: "MAT_1200_INTERS_60X60X3",
          label: "Inters 60x60x3",
          unit: "post",
          rate: 42.57,
          quantityRule: { kind: "POST_COUNT", heightMm: 1200, postType: "intermediate" }
        },
        {
          code: "MAT_1200_TOP_RAILS",
          label: "Top rails 48mm CHS 2.50m",
          unit: "rail",
          rate: 22.61,
          quantityRule: { kind: "TOP_RAIL_COUNT", heightKey: "1.2m" }
        },
        {
          code: "MAT_1200_SINGLE_GATE",
          label: "S/L gate 1.20m W x 1.20m H",
          unit: "gate",
          rate: 368,
          quantityRule: { kind: "GATE_COUNT", heightKey: "1.2m", gateType: "SINGLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_1200_DOUBLE_GATE",
          label: "D/L gate 3.00m W x 1.20m H",
          unit: "gate",
          rate: 662,
          quantityRule: { kind: "GATE_COUNT", heightKey: "1.2m", gateType: "DOUBLE_LEAF", output: "gate" }
        }
      ]
    },
    {
      key: "materials-height-2000",
      sheet: "MATERIALS",
      title: "2.00m height",
      rows: [
        {
          code: "MAT_REF_2000_REBOUND_PANELS",
          label: "Rebound panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "PANEL_COUNT", heightKey: "2m", variant: "SUPER_REBOUND" }
        },
        {
          code: "MAT_2000_STEPPED_INTERS",
          label: "Stepped inters",
          unit: "post",
          rate: 45.77,
          quantityRule: { kind: "MANUAL_ENTRY" },
          notes: "Manual quantity where stepped transitions are required.",
          tone: "manual"
        },
        {
          code: "MAT_2000_EXTERNAL_CORNERS",
          label: "External corners 60x60x2",
          unit: "post",
          rate: 86.59,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 2000, cornerType: "external" }
        },
        {
          code: "MAT_2000_INTERNAL_CORNERS",
          label: "Internal corners 60x60x2",
          unit: "post",
          rate: 54.04,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 2000, cornerType: "internal" }
        },
        {
          code: "MAT_2000_INTERS_ENDS",
          label: "Inters / ends 60x60x2",
          unit: "post",
          rate: 32.54,
          quantityRule: { kind: "POST_COUNT", heightMm: 2000, postType: "total" }
        },
        {
          code: "MAT_2000_SINGLE_GATE",
          label: "S/L gate 1.20m W x 2.00m H",
          unit: "gate",
          rate: 540,
          quantityRule: { kind: "GATE_COUNT", heightKey: "2m", gateType: "SINGLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_2000_DOUBLE_GATE",
          label: "D/L gate 3.00m W x 2.00m H",
          unit: "gate",
          rate: 955,
          quantityRule: { kind: "GATE_COUNT", heightKey: "2m", gateType: "DOUBLE_LEAF", output: "gate" }
        }
      ]
    },
    {
      key: "materials-height-2400",
      sheet: "MATERIALS",
      title: "2.40m height",
      rows: [
        {
          code: "MAT_REF_2400_REBOUND_PANELS",
          label: "Rebound panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "PANEL_COUNT", heightKey: "2.4m", variant: "SUPER_REBOUND" }
        },
        {
          code: "MAT_2400_EXTERNAL_CORNERS",
          label: "External corners 60x60x2",
          unit: "post",
          rate: 97.11,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 2400, cornerType: "external" }
        },
        {
          code: "MAT_2400_INTERNAL_CORNERS",
          label: "Internal corners 60x60x2",
          unit: "post",
          rate: 56.98,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 2400, cornerType: "internal" }
        },
        {
          code: "MAT_2400_INTERS_ENDS",
          label: "Inters / ends 60x50x2",
          unit: "post",
          rate: 40.38,
          quantityRule: { kind: "POST_COUNT", heightMm: 2400, postType: "total" }
        },
        {
          code: "MAT_2400_SINGLE_GATE",
          label: "S/L gate 1.20m W x 2.40m H",
          unit: "gate",
          rate: 568,
          quantityRule: { kind: "GATE_COUNT", heightKey: "2.4m", gateType: "SINGLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_2400_DOUBLE_GATE",
          label: "D/L gate 3.00m W x 2.40m H",
          unit: "gate",
          rate: 1008,
          quantityRule: { kind: "GATE_COUNT", heightKey: "2.4m", gateType: "DOUBLE_LEAF", output: "gate" }
        }
      ]
    },
    {
      key: "materials-height-3000",
      sheet: "MATERIALS",
      title: "3.00m height",
      rows: [
        {
          code: "MAT_REF_3000_STANDARD_PANELS",
          label: "Panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "PANEL_COUNT", heightKey: "3m", variant: "STANDARD" }
        },
        {
          code: "MAT_REF_3000_DOUBLE_SKINNED",
          label: "Double skinned panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "MANUAL_ENTRY" },
          tone: "manual"
        },
        {
          code: "MAT_REF_3000_DOUBLE_SKINNED_REBOUND",
          label: "Double skinned rebound panels",
          unit: "panel",
          rate: 0,
          rateMode: "REFERENCE",
          quantityRule: { kind: "PANEL_COUNT", heightKey: "3m", variant: "SUPER_REBOUND" }
        },
        {
          code: "MAT_3000_EXTERNAL_CORNERS",
          label: "External corners 80x80x2.5",
          unit: "post",
          rate: 160.5,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 3000, cornerType: "external" }
        },
        {
          code: "MAT_3000_INTERNAL_CORNERS",
          label: "Internal corners 80x40x2.5",
          unit: "post",
          rate: 75.79,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 3000, cornerType: "internal" }
        },
        {
          code: "MAT_3000_INTERS_ENDS",
          label: "Inters / ends 80x40x2.5",
          unit: "post",
          rate: 52.79,
          quantityRule: { kind: "POST_COUNT", heightMm: 3000, postType: "total" }
        },
        {
          code: "MAT_3000_SINGLE_GATE",
          label: "S/L gate 1.20m W x 3.00m H + lintel",
          unit: "gate",
          rate: 741.53,
          quantityRule: { kind: "GATE_COUNT", heightKey: "3m", gateType: "SINGLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_3000_DOUBLE_GATE",
          label: "D/L gate 3.00m W x 3.00m H + lintel",
          unit: "gate",
          rate: 1244.84,
          quantityRule: { kind: "GATE_COUNT", heightKey: "3m", gateType: "DOUBLE_LEAF", output: "gate" }
        }
      ]
    },
    {
      key: "materials-height-4000-plus",
      sheet: "MATERIALS",
      title: "4.00m to 6.00m",
      caption: "Upper-height gate and post schedule",
      rows: [
        {
          code: "MAT_4000_EXTERNAL_CORNERS",
          label: "4.00m external corners 80x80x3",
          unit: "post",
          rate: 206.43,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 4000, cornerType: "external" }
        },
        {
          code: "MAT_4000_INTERNAL_CORNERS",
          label: "4.00m internal corners 80x80x3",
          unit: "post",
          rate: 120.69,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 4000, cornerType: "internal" }
        },
        {
          code: "MAT_4000_INTERS_ENDS",
          label: "4.00m inters / ends 100x50x3",
          unit: "post",
          rate: 96.58,
          quantityRule: { kind: "POST_COUNT", heightMm: 4000, postType: "total" }
        },
        {
          code: "MAT_4000_DOUBLE_GATE",
          label: "4.00m D/L gate 3.00m W x 3.00m H + lintel",
          unit: "gate",
          rate: 1723.1,
          quantityRule: { kind: "GATE_COUNT", heightKey: "4m", gateType: "DOUBLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_4500_EXTERNAL_CORNERS",
          label: "4.50m external corners 80x80x3",
          unit: "post",
          rate: 220.13,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 4500, cornerType: "external" }
        },
        {
          code: "MAT_4500_INTERNAL_CORNERS",
          label: "4.50m internal corners 100x50x3",
          unit: "post",
          rate: 134.61,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 4500, cornerType: "internal" }
        },
        {
          code: "MAT_4500_INTERS_ENDS",
          label: "4.50m inters / ends 100x50x3",
          unit: "post",
          rate: 97.82,
          quantityRule: { kind: "POST_COUNT", heightMm: 4500, postType: "total" }
        },
        {
          code: "MAT_4500_DOUBLE_GATE",
          label: "4.50m D/L gate 3.00m W x 3.00m H + lintel",
          unit: "gate",
          rate: 1816.86,
          quantityRule: { kind: "GATE_COUNT", heightKey: "4.5m", gateType: "DOUBLE_LEAF", output: "gate" }
        },
        {
          code: "MAT_6000_EXTERNAL_CORNERS",
          label: "6.00m external corners 100x100x3",
          unit: "post",
          rate: 350,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 6000, cornerType: "external" }
        },
        {
          code: "MAT_6000_INTERNAL_CORNERS",
          label: "6.00m internal corners 120x60x3",
          unit: "post",
          rate: 250,
          quantityRule: { kind: "CORNER_COUNT", heightMm: 6000, cornerType: "internal" }
        },
        {
          code: "MAT_6000_INTERS_ENDS",
          label: "6.00m inters / ends 120x60x3",
          unit: "post",
          rate: 225,
          quantityRule: { kind: "POST_COUNT", heightMm: 6000, postType: "total" }
        },
        {
          code: "MAT_6000_DOUBLE_GATE",
          label: "6.00m D/L gate 3.00m W x 3.00m H + lintel",
          unit: "gate",
          rate: 1594.8,
          quantityRule: { kind: "GATE_COUNT", heightKey: "6m", gateType: "DOUBLE_LEAF", output: "gate" }
        }
      ]
    }
  ];
}

function buildPanelMaterialSection(): PricingWorkbookSection {
  return {
    key: "materials-panel-stock",
    sheet: "MATERIALS",
    title: "Panels",
    caption: "Primary panel material schedule",
    rows: [
      {
        code: "MAT_PANEL_1000_STANDARD",
        label: "1.00m 8/6/8 panels",
        unit: "panel",
        rate: 41.51,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1000, variant: "STANDARD" }
      },
      {
        code: "MAT_PANEL_1000_REBOUND",
        label: "1.00m 8/6/8 spectator rebound",
        unit: "panel",
        rate: 86.72,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1000, variant: "SUPER_REBOUND" }
      },
      {
        code: "MAT_PANEL_1400_STANDARD",
        label: "1.40m 8/6/8 panels",
        unit: "panel",
        rate: 54.42,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1400, variant: "STANDARD" }
      },
      {
        code: "MAT_PANEL_2000_STANDARD",
        label: "2.00m 8/6/8 panels",
        unit: "panel",
        rate: 76.1,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2000, variant: "STANDARD" }
      },
      {
        code: "MAT_PANEL_2000_REBOUND",
        label: "2.00m 8/6/8 rebound",
        unit: "panel",
        rate: 119.85,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2000, variant: "SUPER_REBOUND" }
      },
      {
        code: "MAT_PANEL_2400_STANDARD",
        label: "2.40m 8/6/8 panels",
        unit: "panel",
        rate: 90.09,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2400, variant: "STANDARD" }
      },
      {
        code: "MAT_PANEL_2400_REBOUND",
        label: "2.40m 8/6/8 rebound",
        unit: "panel",
        rate: 146.51,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2400, variant: "SUPER_REBOUND" }
      },
      {
        code: "MAT_PANEL_3000_STANDARD",
        label: "3.00m 8/6/8 panels",
        unit: "panel",
        rate: 107.64,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 3000, variant: "STANDARD" }
      },
      {
        code: "MAT_PANEL_3000_REBOUND",
        label: "3.00m 8/6/8 rebound",
        unit: "panel",
        rate: 140.51,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 3000, variant: "SUPER_REBOUND" }
      }
    ]
  };
}

function buildConcreteSection(): PricingWorkbookSection {
  return {
    key: "materials-concrete",
    sheet: "MATERIALS",
    title: "Concrete",
    caption: "Rate is cubic metres per post. Section total is priced using the global concrete rate per cube.",
    rows: [
      {
        code: "MAT_CONCRETE_1200",
        label: "1.20m 600x300x300",
        unit: "post",
        rate: 0.054,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 1200 }
      },
      {
        code: "MAT_CONCRETE_2000",
        label: "2.00m 600x300x300",
        unit: "post",
        rate: 0.054,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 2000 }
      },
      {
        code: "MAT_CONCRETE_2400",
        label: "2.40m 600x300x300",
        unit: "post",
        rate: 0.054,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 2400 }
      },
      {
        code: "MAT_CONCRETE_3000",
        label: "3.00m 800x350x350",
        unit: "post",
        rate: 0.098,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 3000 }
      },
      {
        code: "MAT_CONCRETE_4000",
        label: "4.00m 850x350x350",
        unit: "post",
        rate: 0.104,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 4000 }
      },
      {
        code: "MAT_CONCRETE_4500",
        label: "4.50m 1000x350x350",
        unit: "post",
        rate: 0.123,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 4500 }
      },
      {
        code: "MAT_CONCRETE_5000",
        label: "5.00m 1000x450x450",
        unit: "post",
        rate: 0.203,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 5000 }
      },
      {
        code: "MAT_CONCRETE_6000",
        label: "6.00m 1000x500x500",
        unit: "post",
        rate: 0.25,
        rateMode: "VOLUME_PER_UNIT",
        quantityRule: { kind: "TOTAL_POSTS_BY_HEIGHT", heightMm: 6000 }
      }
    ]
  };
}

function buildFeatureMaterialSection(): PricingWorkbookSection {
  return {
    key: "materials-features",
    sheet: "MATERIALS",
    title: "Features and ancillaries",
    rows: [
      {
        code: "MAT_FEATURE_GOAL_UNITS",
        label: "Goal units",
        unit: "item",
        rate: 0,
        rateMode: "REFERENCE",
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "GOAL_UNIT" }
      },
      {
        code: "MAT_FEATURE_LINTEL_PANELS",
        label: "Goal-unit lintel panels",
        unit: "panel",
        rate: 75,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "LINTEL_PANEL" }
      },
      {
        code: "MAT_FEATURE_GOAL_ENCLOSURE_PANELS",
        label: "Goal-unit enclosure panels",
        unit: "panel",
        rate: 107.64,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "ENCLOSURE_PANELS" }
      },
      {
        code: "MAT_FEATURE_GOAL_ENCLOSURE_POSTS",
        label: "Goal-unit enclosure posts",
        unit: "post",
        rate: 97.82,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "ENCLOSURE_POSTS" }
      },
      {
        code: "MAT_FEATURE_BASKETBALL_DEDICATED",
        label: "Dedicated basketball posts",
        unit: "post",
        rate: 454.33,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "BASKETBALL", component: "DEDICATED_POST" }
      },
      {
        code: "MAT_FEATURE_BASKETBALL_POST_MOUNTED",
        label: "Post-mounted basketball assembly",
        unit: "assembly",
        rate: 450,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "BASKETBALL", component: "POST_MOUNTED_ASSEMBLY" }
      },
      {
        code: "MAT_FEATURE_KICKBOARD_BOARDS",
        label: "Kickboards",
        unit: "board",
        rate: 13.25,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "KICKBOARD", component: "BOARDS" }
      },
      {
        code: "MAT_FEATURE_PITCH_DIVIDER_ANCHORS",
        label: "Pitch-divider anchor posts",
        unit: "post",
        rate: 255,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "PITCH_DIVIDER", component: "ANCHOR_POSTS" }
      },
      {
        code: "MAT_FEATURE_PITCH_DIVIDER_SUPPORTS",
        label: "Pitch-divider support posts",
        unit: "post",
        rate: 87,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "PITCH_DIVIDER", component: "SUPPORT_POSTS" }
      },
      {
        code: "MAT_FEATURE_PITCH_DIVIDER_NETTING",
        label: "Pitch-divider netting",
        unit: "m",
        rate: 2.38,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "PITCH_DIVIDER", component: "NETTING_RUN" }
      },
      {
        code: "MAT_FEATURE_SIDE_NETTING_AREA",
        label: "Side netting",
        unit: "m2",
        rate: 2.09,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "SIDE_NETTING", component: "NETTING_AREA" }
      },
      {
        code: "MAT_FEATURE_SIDE_NETTING_POSTS",
        label: "Extended side-netting posts",
        unit: "post",
        rate: 40,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "SIDE_NETTING", component: "EXTENDED_POSTS" }
      },
      {
        code: "MAT_FEATURE_FLOODLIGHT_COLUMNS",
        label: "Floodlight columns",
        unit: "column",
        rate: 481,
        quantityRule: { kind: "FLOODLIGHT_COLUMN_COUNT" }
      }
    ]
  };
}

function buildPlantMaterialSection(): PricingWorkbookSection {
  return {
    key: "materials-plant",
    sheet: "MATERIALS",
    title: "Plant and delivery",
    rows: [
      {
        code: "MAT_PLANT_HIRE",
        label: "Plant hire lump sum",
        unit: "item",
        rate: 750,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "MAT_SKIP_HIRE",
        label: "Skip - 8 yard",
        unit: "item",
        rate: 295,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "MAT_LIFTING",
        label: "Lifting",
        unit: "item",
        rate: 300,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "MAT_MISC_DELIVERY",
        label: "Delivery / misc",
        unit: "item",
        rate: 150,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      }
    ]
  };
}

function buildLowerPostLabourSection(): PricingWorkbookSection {
  return {
    key: "labour-posts-lower",
    sheet: "LABOUR",
    title: "Posts and rails up to 2.40m",
    rows: [
      {
        code: "LAB_1200_INTERS_ENDS",
        label: "1.20m spectator inters / ends",
        unit: "post",
        rate: 5.38,
        quantityRule: { kind: "POST_COUNT", heightMm: 1200, postType: "total" }
      },
      {
        code: "LAB_1200_CORNERS",
        label: "1.20m spectator corners",
        unit: "post",
        rate: 6.9,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 1200, cornerType: "total" }
      },
      {
        code: "LAB_1200_TOP_RAILS",
        label: "1.20m top rails",
        unit: "rail",
        rate: 3,
        quantityRule: { kind: "TOP_RAIL_COUNT", heightKey: "1.2m" }
      },
      {
        code: "LAB_2000_INTERS_ENDS",
        label: "2.00m inters / ends",
        unit: "post",
        rate: 5.38,
        quantityRule: { kind: "POST_COUNT", heightMm: 2000, postType: "total" }
      },
      {
        code: "LAB_2000_CORNERS",
        label: "2.00m corners",
        unit: "post",
        rate: 6.9,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 2000, cornerType: "total" }
      },
      {
        code: "LAB_2400_INTERS_ENDS",
        label: "2.40m inters / ends",
        unit: "post",
        rate: 5.38,
        quantityRule: { kind: "POST_COUNT", heightMm: 2400, postType: "total" }
      },
      {
        code: "LAB_2400_CORNERS",
        label: "2.40m corners",
        unit: "post",
        rate: 6.9,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 2400, cornerType: "total" }
      }
    ]
  };
}

function buildUpperPostLabourSection(): PricingWorkbookSection {
  return {
    key: "labour-posts-upper",
    sheet: "LABOUR",
    title: "Posts 3.00m to 6.00m",
    rows: [
      {
        code: "LAB_3000_INTERS_ENDS",
        label: "3.00m inters / ends",
        unit: "post",
        rate: 5.63,
        quantityRule: { kind: "POST_COUNT", heightMm: 3000, postType: "total" }
      },
      {
        code: "LAB_3000_CORNERS",
        label: "3.00m corners / two way",
        unit: "post",
        rate: 7.56,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 3000, cornerType: "total" }
      },
      {
        code: "LAB_3600_INTERS_ENDS",
        label: "3.60m inters / ends",
        unit: "post",
        rate: 6.3,
        quantityRule: { kind: "POST_COUNT", heightMm: 3600, postType: "total" }
      },
      {
        code: "LAB_3600_CORNERS",
        label: "3.60m corners / two way",
        unit: "post",
        rate: 8.1,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 3600, cornerType: "total" }
      },
      {
        code: "LAB_4000_INTERS_ENDS",
        label: "4.00m inters / ends",
        unit: "post",
        rate: 7.14,
        quantityRule: { kind: "POST_COUNT", heightMm: 4000, postType: "total" }
      },
      {
        code: "LAB_4000_CORNERS",
        label: "4.00m corners / two way",
        unit: "post",
        rate: 8.7,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 4000, cornerType: "total" }
      },
      {
        code: "LAB_4500_INTERS_ENDS",
        label: "4.50m inters / ends",
        unit: "post",
        rate: 8.1,
        quantityRule: { kind: "POST_COUNT", heightMm: 4500, postType: "total" }
      },
      {
        code: "LAB_4500_CORNERS",
        label: "4.50m corners / two way",
        unit: "post",
        rate: 12.3,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 4500, cornerType: "total" }
      },
      {
        code: "LAB_5000_INTERS_ENDS",
        label: "5.00m inters / ends",
        unit: "post",
        rate: 8.7,
        quantityRule: { kind: "POST_COUNT", heightMm: 5000, postType: "total" }
      },
      {
        code: "LAB_5000_CORNERS",
        label: "5.00m corners / two way",
        unit: "post",
        rate: 13.5,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 5000, cornerType: "total" }
      },
      {
        code: "LAB_6000_INTERS_ENDS",
        label: "6.00m inters / ends",
        unit: "post",
        rate: 14.4,
        quantityRule: { kind: "POST_COUNT", heightMm: 6000, postType: "total" }
      },
      {
        code: "LAB_6000_CORNERS",
        label: "6.00m corners / two way",
        unit: "post",
        rate: 20.94,
        quantityRule: { kind: "CORNER_COUNT", heightMm: 6000, cornerType: "total" }
      }
    ]
  };
}

function buildGateLabourSection(): PricingWorkbookSection {
  return {
    key: "labour-gates",
    sheet: "LABOUR",
    title: "Gate installation",
    rows: [
      {
        code: "LAB_GATES_SMALL_SINGLE",
        label: "Single leaf gates up to and including 4.00m",
        unit: "gate",
        rate: 90,
        quantityRule: { kind: "GATE_COUNT_BUCKET", heightBucket: "UP_TO_4M", gateType: "SINGLE_LEAF" }
      },
      {
        code: "LAB_GATES_SMALL_DOUBLE",
        label: "Double leaf gates up to and including 4.00m",
        unit: "gate",
        rate: 170,
        quantityRule: { kind: "GATE_COUNT_BUCKET", heightBucket: "UP_TO_4M", gateType: "DOUBLE_LEAF" }
      },
      {
        code: "LAB_GATES_LARGE_SINGLE",
        label: "Single leaf gates at 4.50m and above",
        unit: "gate",
        rate: 103.2,
        quantityRule: { kind: "GATE_COUNT_BUCKET", heightBucket: "AT_LEAST_4_5M", gateType: "SINGLE_LEAF" }
      },
      {
        code: "LAB_GATES_LARGE_DOUBLE",
        label: "Double leaf gates at 4.50m and above",
        unit: "gate",
        rate: 206.4,
        quantityRule: { kind: "GATE_COUNT_BUCKET", heightBucket: "AT_LEAST_4_5M", gateType: "DOUBLE_LEAF" }
      }
    ]
  };
}

function buildPanelLabourSection(): PricingWorkbookSection {
  return {
    key: "labour-panels",
    sheet: "LABOUR",
    title: "Panel installation",
    rows: [
      {
        code: "LAB_PANEL_1000_GROUND_STANDARD",
        label: "1.00m panels @ ground",
        unit: "panel",
        rate: 4.9,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1000, lift: "GROUND", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_1000_GROUND_REBOUND",
        label: "1.00m spectator rebound @ ground",
        unit: "panel",
        rate: 6.5,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1000, lift: "GROUND", variant: "SUPER_REBOUND" }
      },
      {
        code: "LAB_PANEL_1400_FIRST_STANDARD",
        label: "1.40m panels @ 1st lift",
        unit: "panel",
        rate: 4,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 1400, lift: "FIRST", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_2000_GROUND_STANDARD",
        label: "2.00m panels @ ground",
        unit: "panel",
        rate: 7.06,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2000, lift: "GROUND", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_2000_GROUND_REBOUND",
        label: "2.00m rebound @ ground",
        unit: "panel",
        rate: 6.5,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2000, lift: "GROUND", variant: "SUPER_REBOUND" }
      },
      {
        code: "LAB_PANEL_2400_GROUND_STANDARD",
        label: "2.40m panels @ ground",
        unit: "panel",
        rate: 7.5,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2400, lift: "GROUND", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_2400_GROUND_REBOUND",
        label: "2.40m rebound @ ground",
        unit: "panel",
        rate: 8,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 2400, lift: "GROUND", variant: "SUPER_REBOUND" }
      },
      {
        code: "LAB_PANEL_3000_GROUND_STANDARD",
        label: "3.00m panels @ ground",
        unit: "panel",
        rate: 7.5,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 3000, lift: "GROUND", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_3000_FIRST_STANDARD",
        label: "3.00m panels @ 1st lift",
        unit: "panel",
        rate: 10,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 3000, lift: "FIRST", variant: "STANDARD" }
      },
      {
        code: "LAB_PANEL_3000_GROUND_REBOUND",
        label: "3.00m rebound @ ground",
        unit: "panel",
        rate: 8.5,
        quantityRule: { kind: "PANEL_LAYER_COUNT", panelHeightMm: 3000, lift: "GROUND", variant: "SUPER_REBOUND" }
      }
    ]
  };
}

function buildSiteWorksLabourSection(): PricingWorkbookSection {
  return {
    key: "labour-site-works",
    sheet: "LABOUR",
    title: "Features and site works",
    rows: [
      {
        code: "LAB_KICKBOARDS",
        label: "Kickboards",
        unit: "board",
        rate: 2.25,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "KICKBOARD", component: "BOARDS" }
      },
      {
        code: "LAB_BACK_EDGING",
        label: "Back edging",
        unit: "post",
        rate: 2.4,
        quantityRule: { kind: "TOTAL_POSTS" }
      },
      {
        code: "LAB_HARD_DIG",
        label: "Hard dig contingency",
        unit: "item",
        rate: 2.4,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "LAB_CLEAR_SPOILS",
        label: "Clear spoils",
        unit: "item",
        rate: 2.4,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "LAB_LINTEL_RECESS",
        label: "Lintel recess infill",
        unit: "panel",
        rate: 75,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "LINTEL_PANEL" }
      },
      {
        code: "LAB_GOAL_UNITS",
        label: "Goal units",
        unit: "item",
        rate: 350,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "GOAL_UNIT", component: "GOAL_UNIT" }
      },
      {
        code: "LAB_BASKETBALL_POSTS",
        label: "Basketball posts",
        unit: "post",
        rate: 100,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "BASKETBALL", component: "DEDICATED_POST" }
      },
      {
        code: "LAB_FLOODLIGHT_COLUMNS",
        label: "Floodlight columns",
        unit: "column",
        rate: 100,
        quantityRule: { kind: "FLOODLIGHT_COLUMN_COUNT" }
      },
      {
        code: "LAB_PITCH_DIVIDER_POSTS",
        label: "Pitch-divider posts",
        unit: "post",
        rate: 50,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "PITCH_DIVIDER", component: "ANCHOR_POSTS" }
      },
      {
        code: "LAB_PITCH_DIVIDER_NETTING",
        label: "Pitch-divider netting",
        unit: "m",
        rate: 50,
        quantityRule: { kind: "FEATURE_QUANTITY", featureKind: "PITCH_DIVIDER", component: "NETTING_RUN" }
      },
      {
        code: "LAB_FREETYPE_1",
        label: "Free-type item 1",
        unit: "item",
        rate: 0,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "LAB_FREETYPE_2",
        label: "Free-type item 2",
        unit: "item",
        rate: 0,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      },
      {
        code: "LAB_FREETYPE_3",
        label: "Free-type item 3",
        unit: "item",
        rate: 0,
        quantityRule: { kind: "MANUAL_ENTRY" },
        tone: "manual"
      }
    ]
  };
}

export function buildDefaultPricingWorkbookConfig(): PricingWorkbookConfig {
  return {
    settings: {
      labourOverheadPercent: 75,
      travelLodgePerDay: 90,
      markupRate: 250,
      distributionCharge: 215,
      concretePricePerCube: 150,
      hardDigDefault: false,
      clearSpoilsDefault: false,
      colourOption: "Black or Green"
    },
    sections: [
      ...buildHeightMaterialSections(),
      buildPanelMaterialSection(),
      buildConcreteSection(),
      buildFeatureMaterialSection(),
      buildPlantMaterialSection(),
      buildLowerPostLabourSection(),
      buildUpperPostLabourSection(),
      buildGateLabourSection(),
      buildPanelLabourSection(),
      buildSiteWorksLabourSection()
    ]
  };
}

export function buildDefaultJobCommercialInputs(): JobCommercialInputs {
  const workbook = buildDefaultPricingWorkbookConfig();
  return {
    labourOverheadPercent: workbook.settings.labourOverheadPercent,
    travelLodgePerDay: workbook.settings.travelLodgePerDay,
    travelDays: 0,
    markupRate: workbook.settings.markupRate,
    markupUnits: 0,
    distributionCharge: workbook.settings.distributionCharge,
    concretePricePerCube: workbook.settings.concretePricePerCube,
    hardDig: workbook.settings.hardDigDefault,
    clearSpoils: workbook.settings.clearSpoilsDefault
  };
}

export function isManualWorkbookRow(row: PricingWorkbookRow): boolean {
  return row.quantityRule.kind === "MANUAL_ENTRY";
}

export function groupWorkbookSectionsBySheet(
  config: PricingWorkbookConfig
): Record<PricingWorkbookSheet, PricingWorkbookSection[]> {
  return {
    MATERIALS: config.sections.filter((section) => section.sheet === "MATERIALS"),
    LABOUR: config.sections.filter((section) => section.sheet === "LABOUR")
  };
}

export function findWorkbookRowByCode(config: PricingWorkbookConfig, code: string): PricingWorkbookRow | null {
  for (const section of config.sections) {
    const row = section.rows.find((entry) => entry.code === code);
    if (row) {
      return row;
    }
  }
  return null;
}

export function isUpperHeight(heightKey: FenceHeightKey): boolean {
  return heightKey === "4.5m" || heightKey === "5m" || heightKey === "6m";
}

export function normalizeTwinBarVariant(variant: TwinBarVariant | undefined): TwinBarVariant {
  return variant ?? "STANDARD";
}
