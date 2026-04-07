import type {
  FenceHeightKey,
  JobCommercialInputs,
  TwinBarVariant,
} from "./domain.js";
import {
  BASKETBALL_ARM_LENGTHS_MM,
  GOAL_UNIT_HEIGHTS_MM,
  GOAL_UNIT_WIDTHS_MM,
  KICKBOARD_SECTION_HEIGHTS_MM,
  TWIN_BAR_HEIGHT_KEYS,
} from "./domain.js";
import type { PricingItemCategory } from "./estimating.js";

export const PRICING_WORKBOOK_SHEETS = ["MATERIALS", "LABOUR"] as const;
export type PricingWorkbookSheet = (typeof PRICING_WORKBOOK_SHEETS)[number];

export const INSTALL_LIFT_LEVELS = ["GROUND", "FIRST", "SECOND"] as const;
export type InstallLiftLevel = (typeof INSTALL_LIFT_LEVELS)[number];

export const PRICING_WORKBOOK_RATE_MODES = ["MONEY", "REFERENCE", "VOLUME_PER_UNIT"] as const;
export type PricingWorkbookRateMode = (typeof PRICING_WORKBOOK_RATE_MODES)[number];

export const COMMERCIAL_LABOUR_DAY_VALUE_CODE = "COMMERCIAL_LABOUR_DAY_VALUE";
export const COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE = "COMMERCIAL_TRAVEL_LODGE_PER_DAY";
export const COMMERCIAL_MARKUP_RATE_CODE = "COMMERCIAL_MARKUP_RATE";
export const COMMERCIAL_DISTRIBUTION_CHARGE_CODE = "COMMERCIAL_DISTRIBUTION_CHARGE";
export const COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE = "COMMERCIAL_CONCRETE_PRICE_PER_CUBE";
export const COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE = "COMMERCIAL_HARD_DIG_RATE_PER_HOLE";
export const COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE = "COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE";

export const COMMERCIAL_TRAVEL_RATE_CODE = COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE;

export interface PricingWorkbookSettings {
  labourOverheadPercent?: number | undefined;
  labourDayValue?: number | undefined;
  travelLodgePerDay: number;
  markupRate: number;
  distributionCharge: number;
  concretePricePerCube: number;
  hardDigDefault?: boolean | undefined;
  clearSpoilsDefault?: boolean | undefined;
  hardDigRatePerHole?: number | undefined;
  clearSpoilsRatePerHole?: number | undefined;
  colourOption: string;
}

export type PricingWorkbookQuantityRule =
  | { kind: "MANUAL_ENTRY"; defaultQuantity?: number | undefined }
  | { kind: "CATALOG_QUANTITY"; quantityKey: string };

export interface PricingWorkbookRowPresentation {
  pairKey: string;
  groupKey: string;
  groupTitle: string;
  sortOrder: number;
}

export interface PricingWorkbookRow {
  code: string;
  label: string;
  unit: string;
  rate: number;
  rateMode?: PricingWorkbookRateMode | undefined;
  quantityRule: PricingWorkbookQuantityRule;
  notes?: string | undefined;
  tone?: "default" | "highlight" | "manual" | "warning" | undefined;
  category?: PricingItemCategory | undefined;
  presentation?: PricingWorkbookRowPresentation | undefined;
  concreteQuantityKey?: string | undefined;
  holeQuantityKey?: string | undefined;
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
  labourDayValue?: number | undefined;
  labourDays?: number | undefined;
  travelLodgePerDay?: number | undefined;
  travelDays?: number | undefined;
  markupRate?: number | undefined;
  markupUnits?: number | undefined;
  distributionCharge?: number | undefined;
  concretePricePerCube?: number | undefined;
  hardDigRatePerHole?: number | undefined;
  clearSpoilsRatePerHole?: number | undefined;
  holeCount?: number | undefined;
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
  category?: PricingItemCategory | undefined;
  presentation?: PricingWorkbookRowPresentation | undefined;
  concreteQuantityKey?: string | undefined;
  concreteQuantity?: number | undefined;
  holeQuantityKey?: string | undefined;
  holeQuantity?: number | undefined;
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
  labourOverheadPercent?: number | undefined;
  labourOverheadAmount?: number | undefined;
  distributionCharge: number;
  travelDays?: number | undefined;
  travelRatePerDay?: number | undefined;
  travelTotal: number;
  markupUnits?: number | undefined;
  markupRate: number;
  markupTotal: number;
  labourDayValue?: number | undefined;
  labourDays?: number | undefined;
  holeCount?: number | undefined;
  hardDigRatePerHole?: number | undefined;
  hardDigTotal?: number | undefined;
  clearSpoilsRatePerHole?: number | undefined;
  clearSpoilsTotal?: number | undefined;
  grandTotal: number;
}

export interface EstimateWorkbook {
  settings: PricingWorkbookSettings;
  sections: EstimateWorkbookSection[];
  manualEntries: EstimateWorkbookManualEntry[];
  commercialInputs: EstimateWorkbookCommercialInputs;
  totals: EstimateWorkbookTotals;
}

interface CatalogRowDefinition {
  pairKey: string;
  label: string;
  unit: string;
  category: PricingItemCategory;
  groupKey: string;
  groupTitle: string;
  sortOrder: number;
  quantityKey: string;
  materialCode?: string | undefined;
  materialRate?: number | undefined;
  labourCode?: string | undefined;
  labourRate?: number | undefined;
  notes?: string | undefined;
  concreteQuantityKey?: string | undefined;
  holeQuantityKey?: string | undefined;
}

const HEIGHT_SORT_ORDER = [1200, 1800, 2000, 2400, 3000, 4000, 4500, 5000, 6000];
const FEATURE_GROUP_SORT_ORDER = {
  "goal-units": 8000,
  basketball: 8100,
  "floodlight-columns": 8200,
  kickboards: 8300,
  "pitch-dividers": 8400,
  "side-netting": 8500,
} as const;

const DEFAULT_PANEL_MATERIAL_RATE: Record<string, number> = {
  "1000:STANDARD": 42,
  "1000:SUPER_REBOUND": 48,
  "1400:STANDARD": 49,
  "1400:SUPER_REBOUND": 56,
  "1800:STANDARD": 55,
  "1800:SUPER_REBOUND": 61,
  "2000:STANDARD": 60,
  "2000:SUPER_REBOUND": 66,
  "2400:STANDARD": 68,
  "2400:SUPER_REBOUND": 75,
  "3000:STANDARD": 82,
  "3000:SUPER_REBOUND": 90,
};

const DEFAULT_PANEL_LABOUR_RATE: Record<string, number> = {
  "1000:GROUND:STANDARD": 4.9,
  "1000:GROUND:SUPER_REBOUND": 6.5,
  "1400:FIRST:STANDARD": 4,
  "1400:FIRST:SUPER_REBOUND": 5,
  "1800:GROUND:STANDARD": 5.4,
  "1800:GROUND:SUPER_REBOUND": 6.7,
  "2000:GROUND:STANDARD": 7.06,
  "2000:GROUND:SUPER_REBOUND": 6.5,
  "2400:GROUND:STANDARD": 7.5,
  "2400:GROUND:SUPER_REBOUND": 8,
  "3000:GROUND:STANDARD": 7.5,
  "3000:FIRST:STANDARD": 10,
  "3000:GROUND:SUPER_REBOUND": 8.5,
  "3000:FIRST:SUPER_REBOUND": 10.5,
};

const DEFAULT_POST_MATERIAL_RATE: Record<string, Partial<Record<"end" | "intermediate" | "corner" | "junction" | "inlineJoin", number>>> = {
  "1200": { end: 39.21, intermediate: 42.57, corner: 71.53, junction: 45, inlineJoin: 45 },
  "1800": { end: 43, intermediate: 45, corner: 78, junction: 47, inlineJoin: 47 },
  "2000": { end: 44, intermediate: 46, corner: 86.59, junction: 48, inlineJoin: 48 },
  "2400": { end: 49, intermediate: 52, corner: 95, junction: 54, inlineJoin: 54 },
  "3000": { end: 58, intermediate: 60, corner: 110, junction: 64, inlineJoin: 64 },
  "4000": { end: 74, intermediate: 78, corner: 138, junction: 82, inlineJoin: 82 },
  "4500": { end: 84, intermediate: 88, corner: 155, junction: 92, inlineJoin: 92 },
  "5000": { end: 96, intermediate: 101, corner: 174, junction: 105, inlineJoin: 105 },
  "6000": { end: 128, intermediate: 134, corner: 228, junction: 140, inlineJoin: 140 },
};

const DEFAULT_POST_LABOUR_RATE: Record<string, Partial<Record<"end" | "intermediate" | "corner" | "junction" | "inlineJoin", number>>> = {
  "1200": { end: 5.38, intermediate: 5.38, corner: 6.9, junction: 5.7, inlineJoin: 5.7 },
  "1800": { end: 5.38, intermediate: 5.38, corner: 6.9, junction: 5.7, inlineJoin: 5.7 },
  "2000": { end: 5.38, intermediate: 5.38, corner: 6.9, junction: 5.7, inlineJoin: 5.7 },
  "2400": { end: 5.38, intermediate: 5.38, corner: 6.9, junction: 5.7, inlineJoin: 5.7 },
  "3000": { end: 5.63, intermediate: 5.63, corner: 7.56, junction: 5.95, inlineJoin: 5.95 },
  "4000": { end: 7.14, intermediate: 7.14, corner: 8.7, junction: 7.5, inlineJoin: 7.5 },
  "4500": { end: 8.1, intermediate: 8.1, corner: 12.3, junction: 8.4, inlineJoin: 8.4 },
  "5000": { end: 8.7, intermediate: 8.7, corner: 13.5, junction: 9.1, inlineJoin: 9.1 },
  "6000": { end: 14.4, intermediate: 14.4, corner: 20.94, junction: 14.8, inlineJoin: 14.8 },
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatHeightLabel(heightKey: FenceHeightKey): string {
  const metres = Number.parseFloat(heightKey);
  return `${metres.toFixed(2)}m`;
}

function heightKeyToMm(heightKey: FenceHeightKey): number {
  return Math.round(Number.parseFloat(heightKey) * 1000);
}

function getHeightGroup(heightKey: FenceHeightKey): Pick<CatalogRowDefinition, "groupKey" | "groupTitle" | "sortOrder"> {
  const heightMm = heightKeyToMm(heightKey);
  const sortIndex = HEIGHT_SORT_ORDER.indexOf(heightMm);
  return {
    groupKey: `height-${heightMm}`,
    groupTitle: `${formatHeightLabel(heightKey)} height`,
    sortOrder: sortIndex >= 0 ? sortIndex : 5000 + heightMm,
  };
}

function getFeatureGroup(
  key: keyof typeof FEATURE_GROUP_SORT_ORDER,
  title: string,
): Pick<CatalogRowDefinition, "groupKey" | "groupTitle" | "sortOrder"> {
  return {
    groupKey: key,
    groupTitle: title,
    sortOrder: FEATURE_GROUP_SORT_ORDER[key],
  };
}

function buildPairRows(definition: CatalogRowDefinition): PricingWorkbookRow[] {
  const presentation: PricingWorkbookRowPresentation = {
    pairKey: definition.pairKey,
    groupKey: definition.groupKey,
    groupTitle: definition.groupTitle,
    sortOrder: definition.sortOrder,
  };
  const rows: PricingWorkbookRow[] = [];
  if (definition.materialCode) {
    rows.push({
      code: definition.materialCode,
      label: definition.label,
      unit: definition.unit,
      rate: roundMoney(definition.materialRate ?? 0),
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: definition.quantityKey },
      category: definition.category,
      presentation,
      ...(definition.notes ? { notes: definition.notes } : {}),
      ...(definition.concreteQuantityKey ? { concreteQuantityKey: definition.concreteQuantityKey } : {}),
    });
  }
  if (definition.labourCode) {
    rows.push({
      code: definition.labourCode,
      label: definition.label,
      unit: definition.unit,
      rate: roundMoney(definition.labourRate ?? 0),
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: definition.quantityKey },
      category: definition.category,
      presentation,
      ...(definition.notes ? { notes: definition.notes } : {}),
      ...(definition.holeQuantityKey ? { holeQuantityKey: definition.holeQuantityKey } : {}),
    });
  }
  return rows;
}

function getPanelMaterialRate(panelHeightMm: number, variant: TwinBarVariant): number {
  return DEFAULT_PANEL_MATERIAL_RATE[`${panelHeightMm}:${variant}`] ?? 0;
}

function getPanelLabourRate(panelHeightMm: number, lift: InstallLiftLevel, variant: TwinBarVariant): number {
  return DEFAULT_PANEL_LABOUR_RATE[`${panelHeightMm}:${lift}:${variant}`] ?? 0;
}

function getPostMaterialRate(heightMm: number, postType: "end" | "intermediate" | "corner" | "junction" | "inlineJoin"): number {
  return DEFAULT_POST_MATERIAL_RATE[String(heightMm)]?.[postType] ?? 0;
}

function getPostLabourRate(heightMm: number, postType: "end" | "intermediate" | "corner" | "junction" | "inlineJoin"): number {
  return DEFAULT_POST_LABOUR_RATE[String(heightMm)]?.[postType] ?? 0;
}

function buildFenceRows(): PricingWorkbookRow[] {
  const rows: PricingWorkbookRow[] = [];

  for (const heightKey of TWIN_BAR_HEIGHT_KEYS) {
    const group = getHeightGroup(heightKey);
    const heightMm = heightKeyToMm(heightKey);
    const panelLayers =
      heightKey === "4m"
        ? [{ panelHeightMm: 3000, lift: "GROUND" as const }, { panelHeightMm: 1000, lift: "FIRST" as const }]
        : heightKey === "4.5m"
          ? [{ panelHeightMm: 3000, lift: "GROUND" as const }, { panelHeightMm: 1400, lift: "FIRST" as const }]
          : heightKey === "5m"
            ? [{ panelHeightMm: 3000, lift: "GROUND" as const }, { panelHeightMm: 2000, lift: "FIRST" as const }]
            : heightKey === "6m"
              ? [{ panelHeightMm: 3000, lift: "GROUND" as const }, { panelHeightMm: 3000, lift: "FIRST" as const }]
              : [{ panelHeightMm: heightMm, lift: "GROUND" as const }];

    for (const variant of ["STANDARD", "SUPER_REBOUND"] as const) {
      for (const layer of panelLayers) {
        const pairKey = `panel:${heightKey}:${layer.panelHeightMm}:${layer.lift}:${variant}`;
        rows.push(
          ...buildPairRows({
            pairKey,
            label: `${variant === "STANDARD" ? "Standard" : "Rebound"} ${layer.panelHeightMm}mm panel | ${layer.lift.toLowerCase()}`,
            unit: "panel",
            category: "PANELS",
            ...group,
            quantityKey: pairKey,
            materialCode: `MAT_PANEL_${heightKey}_${layer.panelHeightMm}_${layer.lift}_${variant}`,
            materialRate: getPanelMaterialRate(layer.panelHeightMm, variant),
            labourCode: `LAB_PANEL_${heightKey}_${layer.panelHeightMm}_${layer.lift}_${variant}`,
            labourRate: getPanelLabourRate(layer.panelHeightMm, layer.lift, variant),
          }),
        );
      }
    }

    if (heightKey === "1.2m") {
      rows.push(
        ...buildPairRows({
          pairKey: `top-rail:${heightKey}`,
          label: "Top rails",
          unit: "rail",
          category: "PANELS",
          ...group,
          quantityKey: `top-rail:${heightKey}`,
          materialCode: `MAT_TOP_RAIL_${heightKey}`,
          materialRate: 22.61,
          labourCode: `LAB_TOP_RAIL_${heightKey}`,
          labourRate: 3,
        }),
      );
    }

    for (const postType of ["end", "intermediate", "corner", "junction", "inlineJoin"] as const) {
      const label =
        postType === "end"
          ? "End posts"
          : postType === "intermediate"
            ? "Intermediate posts"
            : postType === "corner"
              ? "Corner posts"
              : postType === "junction"
                ? "Junction posts"
                : "Inline join posts";
      const quantityKey = `post:${heightMm}:${postType}:count`;
      rows.push(
        ...buildPairRows({
          pairKey: `post:${heightMm}:${postType}`,
          label,
          unit: "post",
          category: "POSTS",
          ...group,
          quantityKey,
          materialCode: `MAT_POST_${heightMm}_${postType.toUpperCase()}`,
          materialRate: getPostMaterialRate(heightMm, postType),
          labourCode: `LAB_POST_${heightMm}_${postType.toUpperCase()}`,
          labourRate: getPostLabourRate(heightMm, postType),
          concreteQuantityKey: `post:${heightMm}:${postType}:concrete-m3`,
          holeQuantityKey: `post:${heightMm}:${postType}:holes`,
        }),
      );
    }

    for (const gateType of ["SINGLE_LEAF", "DOUBLE_LEAF"] as const) {
      const label = `${gateType === "SINGLE_LEAF" ? "Single leaf" : "Double leaf"} gate`;
      const widthLabel = gateType === "SINGLE_LEAF" ? "1.20m W" : "3.00m W";
      const quantityKey = `gate:${heightKey}:${gateType}:count`;
      rows.push(
        ...buildPairRows({
          pairKey: `gate:${heightKey}:${gateType}`,
          label: `${label} ${formatHeightLabel(heightKey)} H x ${widthLabel}`,
          unit: "gate",
          category: "GATES",
          ...group,
          quantityKey,
          materialCode: `MAT_GATE_${heightKey}_${gateType}`,
          materialRate: gateType === "SINGLE_LEAF" ? 368 : 662,
          labourCode: `LAB_GATE_${heightKey}_${gateType}`,
          labourRate: gateType === "SINGLE_LEAF" ? 90 : 170,
          concreteQuantityKey: `gate:${heightKey}:${gateType}:concrete-m3`,
          holeQuantityKey: `gate:${heightKey}:${gateType}:holes`,
        }),
      );
    }
  }

  return rows;
}

function buildGoalUnitRows(): PricingWorkbookRow[] {
  const rows: PricingWorkbookRow[] = [];
  const group = getFeatureGroup("goal-units", "Goal units");
  for (const widthMm of GOAL_UNIT_WIDTHS_MM) {
    for (const heightMm of GOAL_UNIT_HEIGHTS_MM) {
      const quantityKey = `goal-unit:${widthMm}:${heightMm}:count`;
      rows.push(
        ...buildPairRows({
          pairKey: `goal-unit:${widthMm}:${heightMm}`,
          label: `Goal unit ${widthMm / 1000}m x ${heightMm / 1000}m`,
          unit: "item",
          category: "GOAL_UNITS",
          ...group,
          quantityKey,
          materialCode: `MAT_GOAL_UNIT_${widthMm}_${heightMm}`,
          materialRate: 0,
          labourCode: `LAB_GOAL_UNIT_${widthMm}_${heightMm}`,
          labourRate: 350,
        }),
      );
    }
  }
  return rows;
}

function buildBasketballRows(): PricingWorkbookRow[] {
  const rows: PricingWorkbookRow[] = [];
  const group = getFeatureGroup("basketball", "Basketball");
  for (const armLengthMm of BASKETBALL_ARM_LENGTHS_MM) {
    const quantityKey = `basketball:dedicated:${armLengthMm}:count`;
    rows.push(
      ...buildPairRows({
        pairKey: `basketball:dedicated:${armLengthMm}`,
        label: `Dedicated basketball post ${armLengthMm}mm arm`,
        unit: "post",
        category: "BASKETBALL_POSTS",
        ...group,
        quantityKey,
        materialCode: `MAT_BASKETBALL_DEDICATED_${armLengthMm}`,
        materialRate: 454.33,
        labourCode: `LAB_BASKETBALL_DEDICATED_${armLengthMm}`,
        labourRate: 100,
        concreteQuantityKey: `basketball:dedicated:${armLengthMm}:concrete-m3`,
        holeQuantityKey: `basketball:dedicated:${armLengthMm}:holes`,
      }),
    );
  }
  rows.push(
    ...buildPairRows({
      pairKey: "basketball:mounted",
      label: "Basketball assembly mounted to existing post",
      unit: "assembly",
      category: "BASKETBALL_POSTS",
      ...group,
      quantityKey: "basketball:mounted:count",
      materialCode: "MAT_BASKETBALL_MOUNTED",
      materialRate: 450,
      labourCode: "LAB_BASKETBALL_MOUNTED",
      labourRate: 65,
    }),
    ...buildPairRows({
      pairKey: "basketball:goal-unit-integrated",
      label: "Goal-unit integrated basketball assembly",
      unit: "assembly",
      category: "BASKETBALL_POSTS",
      ...group,
      quantityKey: "basketball:goal-unit-integrated:count",
      materialCode: "MAT_BASKETBALL_GOAL_UNIT_INTEGRATED",
      materialRate: 450,
      labourCode: "LAB_BASKETBALL_GOAL_UNIT_INTEGRATED",
      labourRate: 65,
    }),
  );
  return rows;
}

function buildFloodlightRows(): PricingWorkbookRow[] {
  const group = getFeatureGroup("floodlight-columns", "Floodlight columns");
  return buildPairRows({
    pairKey: "floodlight:column",
    label: "Floodlight columns",
    unit: "column",
    category: "FLOODLIGHT_COLUMNS",
    ...group,
    quantityKey: "floodlight:column:count",
    materialCode: "MAT_FLOODLIGHT_COLUMN",
    materialRate: 481,
    labourCode: "LAB_FLOODLIGHT_COLUMN",
    labourRate: 100,
    concreteQuantityKey: "floodlight:column:concrete-m3",
    holeQuantityKey: "floodlight:column:holes",
  });
}

function buildKickboardRows(): PricingWorkbookRow[] {
  const rows: PricingWorkbookRow[] = [];
  const group = getFeatureGroup("kickboards", "Kickboards");
  for (const sectionHeightMm of KICKBOARD_SECTION_HEIGHTS_MM) {
    for (const profile of ["SQUARE", "CHAMFERED"] as const) {
      const quantityKey = `kickboard:${sectionHeightMm}:${profile}:boards`;
      rows.push(
        ...buildPairRows({
          pairKey: `kickboard:${sectionHeightMm}:${profile}`,
          label: `${sectionHeightMm}mm ${profile.toLowerCase()} kickboards`,
          unit: "board",
          category: "KICKBOARDS",
          ...group,
          quantityKey,
          materialCode: `MAT_KICKBOARD_${sectionHeightMm}_${profile}`,
          materialRate: 13.25,
          labourCode: `LAB_KICKBOARD_${sectionHeightMm}_${profile}`,
          labourRate: 2.25,
        }),
      );
    }
  }
  return rows;
}

function buildPitchDividerRows(): PricingWorkbookRow[] {
  const group = getFeatureGroup("pitch-dividers", "Pitch dividers");
  return buildPairRows({
    pairKey: "pitch-divider",
    label: "Pitch dividers",
    unit: "m",
    category: "PITCH_DIVIDERS",
    ...group,
    quantityKey: "pitch-divider:span-m",
    materialCode: "MAT_PITCH_DIVIDER",
    materialRate: 2.38,
    labourCode: "LAB_PITCH_DIVIDER",
    labourRate: 50,
    holeQuantityKey: "pitch-divider:holes",
  });
}

function buildSideNettingRows(): PricingWorkbookRow[] {
  const rows: PricingWorkbookRow[] = [];
  const group = getFeatureGroup("side-netting", "Side netting");
  for (const additionalHeightMm of [500, 1000, 1500, 2000] as const) {
    rows.push(
      ...buildPairRows({
        pairKey: `side-netting:${additionalHeightMm}`,
        label: `Side netting +${additionalHeightMm}mm`,
        unit: "m2",
        category: "SIDE_NETTING",
        ...group,
        quantityKey: `side-netting:${additionalHeightMm}:area-m2`,
        materialCode: `MAT_SIDE_NETTING_${additionalHeightMm}`,
        materialRate: 2.09,
        labourCode: `LAB_SIDE_NETTING_${additionalHeightMm}`,
        labourRate: 1.5,
      }),
    );
  }
  return rows;
}

function buildDefaultWorkbookRows(): PricingWorkbookRow[] {
  return [
    ...buildFenceRows(),
    ...buildGoalUnitRows(),
    ...buildBasketballRows(),
    ...buildFloodlightRows(),
    ...buildKickboardRows(),
    ...buildPitchDividerRows(),
    ...buildSideNettingRows(),
  ].sort((left, right) => {
    const leftSort = left.presentation?.sortOrder ?? 9999;
    const rightSort = right.presentation?.sortOrder ?? 9999;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.label.localeCompare(right.label, "en-GB", { numeric: true });
  });
}

export function buildDefaultPricingWorkbookConfig(): PricingWorkbookConfig {
  const rows = buildDefaultWorkbookRows();
  return {
    settings: {
      labourOverheadPercent: 0,
      labourDayValue: 205,
      travelLodgePerDay: 90,
      markupRate: 250,
      distributionCharge: 215,
      concretePricePerCube: 150,
      hardDigDefault: false,
      clearSpoilsDefault: false,
      hardDigRatePerHole: 0,
      clearSpoilsRatePerHole: 0,
      colourOption: "Black or Green",
    },
    sections: [
      {
        key: "materials-installables",
        sheet: "MATERIALS",
        title: "Installable materials",
        rows: rows.filter((row) => row.code.startsWith("MAT_")),
      },
      {
        key: "labour-installables",
        sheet: "LABOUR",
        title: "Installable labour",
        rows: rows.filter((row) => row.code.startsWith("LAB_")),
      },
    ],
  };
}

export function buildDefaultJobCommercialInputs(): JobCommercialInputs {
  const workbook = buildDefaultPricingWorkbookConfig();
  return {
    labourOverheadPercent: workbook.settings.labourOverheadPercent ?? 0,
    labourDayValue: workbook.settings.labourDayValue ?? 205,
    travelLodgePerDay: workbook.settings.travelLodgePerDay,
    travelDays: 0,
    markupRate: workbook.settings.markupRate,
    markupUnits: 0,
    distributionCharge: workbook.settings.distributionCharge,
    concretePricePerCube: workbook.settings.concretePricePerCube,
    hardDig: false,
    clearSpoils: false,
    hardDigRatePerHole: workbook.settings.hardDigRatePerHole ?? 0,
    clearSpoilsRatePerHole: workbook.settings.clearSpoilsRatePerHole ?? 0,
  };
}

export const buildDefaultDrawingWorkspaceCommercialInputs = buildDefaultJobCommercialInputs;

export function isManualWorkbookRow(row: PricingWorkbookRow): boolean {
  return row.quantityRule.kind === "MANUAL_ENTRY";
}

export function groupWorkbookSectionsBySheet(
  config: PricingWorkbookConfig,
): Record<PricingWorkbookSheet, PricingWorkbookSection[]> {
  return {
    MATERIALS: config.sections.filter((section) => section.sheet === "MATERIALS"),
    LABOUR: config.sections.filter((section) => section.sheet === "LABOUR"),
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

export function mergePricingWorkbookWithTemplate(
  workbook: PricingWorkbookConfig | null | undefined,
): PricingWorkbookConfig {
  const template = buildDefaultPricingWorkbookConfig();
  if (!workbook) {
    return template;
  }

  const rowsByCode = new Map(
    workbook.sections.flatMap((section) => section.rows.map((row) => [row.code, row] as const)),
  );

  return {
    settings: {
      ...template.settings,
      ...workbook.settings,
      labourDayValue: workbook.settings.labourDayValue ?? template.settings.labourDayValue,
      hardDigRatePerHole:
        workbook.settings.hardDigRatePerHole ?? template.settings.hardDigRatePerHole,
      clearSpoilsRatePerHole:
        workbook.settings.clearSpoilsRatePerHole ?? template.settings.clearSpoilsRatePerHole,
    },
    sections: template.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => {
        const saved = rowsByCode.get(row.code);
        return saved ? { ...row, rate: saved.rate } : row;
      }),
    })),
  };
}
