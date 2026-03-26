import type {
  AncillaryEstimateItem,
  DrawingRecord,
  EstimateGroup,
  EstimateRow,
  EstimateWarning,
  EstimateWorkbook,
  EstimateWorkbookCommercialInputs,
  EstimateWorkbookManualEntry,
  EstimateWorkbookRow,
  EstimateWorkbookSection,
  PricingConfigRecord,
  PricingItemCategory,
  PricingWorkbookConfig,
  PricingWorkbookRow,
  PricedEstimateResult
} from "@fence-estimator/contracts";
import { buildDefaultPricingWorkbookConfig, normalizeTwinBarVariant } from "@fence-estimator/contracts";

import { getSpecConfig } from "./constants.js";

const COMMERCIAL_TRAVEL_DAYS_CODE = "COMMERCIAL_TRAVEL_DAYS";
const COMMERCIAL_MARKUP_UNITS_CODE = "COMMERCIAL_MARKUP_UNITS";
const COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE = "COMMERCIAL_LABOUR_OVERHEAD_PERCENT";
const COMMERCIAL_TRAVEL_RATE_CODE = "COMMERCIAL_TRAVEL_RATE";
const COMMERCIAL_MARKUP_RATE_CODE = "COMMERCIAL_MARKUP_RATE";
const COMMERCIAL_DISTRIBUTION_CHARGE_CODE = "COMMERCIAL_DISTRIBUTION_CHARGE";
const COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE = "COMMERCIAL_CONCRETE_PRICE_PER_CUBE";

interface GateSummary {
  byHeight: Map<string, { SINGLE_LEAF: number; DOUBLE_LEAF: number; CUSTOM: number }>;
  buckets: {
    UP_TO_4M: { SINGLE_LEAF: number; DOUBLE_LEAF: number };
    AT_LEAST_4_5M: { SINGLE_LEAF: number; DOUBLE_LEAF: number };
  };
  customGates: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getWorkbookConfig(pricingConfig: PricingConfigRecord): PricingWorkbookConfig {
  return pricingConfig.workbook ?? buildDefaultPricingWorkbookConfig();
}

function buildPanelLayerCounts(drawing: DrawingRecord): Map<string, number> {
  const counts = new Map<string, number>();

  for (const segment of drawing.layout.segments) {
    if (segment.spec.system !== "TWIN_BAR") {
      continue;
    }
    const config = getSpecConfig(segment.spec);
    const lengthMm = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
    const bays = Math.max(1, Math.ceil(lengthMm / config.bayWidthMm));
    const variant = normalizeTwinBarVariant(segment.spec.twinBarVariant);

    config.layers.forEach((layer, index) => {
      const lift = index === 0 ? "GROUND" : index === 1 ? "FIRST" : "SECOND";
      const key = `${layer.heightMm}:${lift}:${variant}`;
      counts.set(key, (counts.get(key) ?? 0) + bays);
    });
  }

  return counts;
}

function buildGateSummary(drawing: DrawingRecord): GateSummary {
  const byHeight = new Map<string, { SINGLE_LEAF: number; DOUBLE_LEAF: number; CUSTOM: number }>();
  const buckets: GateSummary["buckets"] = {
    UP_TO_4M: { SINGLE_LEAF: 0, DOUBLE_LEAF: 0 },
    AT_LEAST_4_5M: { SINGLE_LEAF: 0, DOUBLE_LEAF: 0 }
  };
  const segmentsById = new Map(drawing.layout.segments.map((segment) => [segment.id, segment] as const));
  let customGates = 0;

  for (const gate of drawing.layout.gates ?? []) {
    const segment = segmentsById.get(gate.segmentId);
    if (!segment) {
      continue;
    }
    const bucket =
      segment.spec.height === "4.5m" || segment.spec.height === "5m" || segment.spec.height === "6m"
        ? "AT_LEAST_4_5M"
        : "UP_TO_4M";
    const heightEntry = byHeight.get(segment.spec.height) ?? { SINGLE_LEAF: 0, DOUBLE_LEAF: 0, CUSTOM: 0 };
    if (gate.gateType === "CUSTOM") {
      heightEntry.CUSTOM += 1;
      customGates += 1;
      byHeight.set(segment.spec.height, heightEntry);
      continue;
    }
    heightEntry[gate.gateType] += 1;
    buckets[bucket][gate.gateType] += 1;
    byHeight.set(segment.spec.height, heightEntry);
  }

  return {
    byHeight,
    buckets,
    customGates
  };
}

function buildFeatureQuantityIndex(drawing: DrawingRecord): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const entry of drawing.estimate.featureQuantities ?? []) {
    const key = `${entry.kind}:${entry.component}`;
    quantities.set(key, (quantities.get(key) ?? 0) + entry.quantity);
  }
  return quantities;
}

function calculateRowQuantity(
  row: PricingWorkbookRow,
  drawing: DrawingRecord,
  manualEntryMap: Map<string, number>,
  panelLayerCounts: Map<string, number>,
  gateSummary: GateSummary,
  featureQuantityIndex: Map<string, number>
): number {
  switch (row.quantityRule.kind) {
    case "MANUAL_ENTRY":
      return roundQuantity(manualEntryMap.get(row.code) ?? row.quantityRule.defaultQuantity ?? 0);
    case "PANEL_COUNT": {
      const bucket = drawing.estimate.materials.twinBarPanelsByFenceHeight[row.quantityRule.heightKey];
      if (!bucket) {
        return 0;
      }
      if (row.quantityRule.variant === "STANDARD") {
        return bucket.standard;
      }
      if (row.quantityRule.variant === "SUPER_REBOUND") {
        return bucket.superRebound;
      }
      return bucket.total;
    }
    case "PANEL_LAYER_COUNT": {
      let quantity = 0;
      const lifts = row.quantityRule.lift ? [row.quantityRule.lift] : ["GROUND", "FIRST", "SECOND"];
      const variants =
        row.quantityRule.variant === "TOTAL" ? (["STANDARD", "SUPER_REBOUND"] as const) : [row.quantityRule.variant];
      for (const lift of lifts) {
        for (const variant of variants) {
          quantity += panelLayerCounts.get(`${row.quantityRule.panelHeightMm}:${lift}:${variant}`) ?? 0;
        }
      }
      return quantity;
    }
    case "POST_COUNT": {
      const bucket = drawing.estimate.posts.byHeightAndType[String(row.quantityRule.heightMm)];
      if (!bucket) {
        return 0;
      }
      return row.quantityRule.postType === "total" ? bucket.total : bucket[row.quantityRule.postType];
    }
    case "CORNER_COUNT": {
      const bucket = drawing.estimate.corners.byHeightMm?.[String(row.quantityRule.heightMm)];
      if (!bucket) {
        return 0;
      }
      return row.quantityRule.cornerType === "total" ? bucket.total : bucket[row.quantityRule.cornerType];
    }
    case "TOP_RAIL_COUNT": {
      const bucket = drawing.estimate.materials.twinBarPanelsByFenceHeight[row.quantityRule.heightKey];
      return bucket?.total ?? 0;
    }
    case "GATE_COUNT": {
      const bucket = gateSummary.byHeight.get(row.quantityRule.heightKey) ?? {
        SINGLE_LEAF: 0,
        DOUBLE_LEAF: 0,
        CUSTOM: 0
      };
      const gateCount = bucket[row.quantityRule.gateType];
      if (row.quantityRule.output === "gate" || row.quantityRule.output === "post_set") {
        return gateCount;
      }
      return row.quantityRule.gateType === "DOUBLE_LEAF" ? gateCount * 2 : gateCount;
    }
    case "GATE_COUNT_BUCKET":
      return gateSummary.buckets[row.quantityRule.heightBucket][row.quantityRule.gateType];
    case "FEATURE_QUANTITY":
      return roundQuantity(featureQuantityIndex.get(`${row.quantityRule.featureKind}:${row.quantityRule.component}`) ?? 0);
    case "FLOODLIGHT_COLUMN_COUNT":
      return drawing.layout.floodlightColumns?.length ?? 0;
    case "TOTAL_POSTS_BY_HEIGHT":
      return drawing.estimate.posts.byHeightMm[String(row.quantityRule.heightMm)] ?? 0;
    case "TOTAL_POSTS":
      return drawing.estimate.posts.total;
  }
}

function buildWorkbookRow(
  section: PricingWorkbookConfig["sections"][number],
  row: PricingWorkbookRow,
  drawing: DrawingRecord,
  manualEntryMap: Map<string, number>,
  panelLayerCounts: Map<string, number>,
  gateSummary: GateSummary,
  featureQuantityIndex: Map<string, number>,
  workbookConfig: PricingWorkbookConfig
): EstimateWorkbookRow {
  const quantity = calculateRowQuantity(row, drawing, manualEntryMap, panelLayerCounts, gateSummary, featureQuantityIndex);
  const rateMode = row.rateMode ?? "MONEY";
  const total =
    rateMode === "REFERENCE"
      ? 0
      : rateMode === "VOLUME_PER_UNIT"
        ? roundMoney(quantity * row.rate * workbookConfig.settings.concretePricePerCube)
        : roundMoney(quantity * row.rate);

  return {
    code: row.code,
    label: row.label,
    unit: row.unit,
    quantity: roundQuantity(quantity),
    rate: row.rate,
    rateMode,
    total,
    isEditable: row.quantityRule.kind === "MANUAL_ENTRY",
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.tone ? { tone: row.tone } : {})
  };
}

function determineRowCategory(section: EstimateWorkbookSection, row: EstimateWorkbookRow): PricingItemCategory {
  if (row.rateMode === "VOLUME_PER_UNIT" || section.key.includes("concrete")) {
    return "CONCRETE";
  }
  if (row.code.includes("FLOODLIGHT")) {
    return "FLOODLIGHT_COLUMNS";
  }
  if (row.code.includes("BASKETBALL")) {
    return "BASKETBALL_POSTS";
  }
  if (section.key.includes("plant")) {
    return "PLANT";
  }
  if (row.code.includes("GATE")) {
    return "GATES";
  }
  if (row.code.includes("PANEL") || row.code.includes("TOP_RAIL")) {
    return "PANELS";
  }
  if (row.code.includes("CORNER") || row.code.includes("INTERS") || row.code.includes("ENDS") || row.code.includes("POSTS")) {
    return "POSTS";
  }
  return "ANCILLARY";
}

function buildEstimateGroups(workbook: EstimateWorkbook, ancillaryItems: AncillaryEstimateItem[]): EstimateGroup[] {
  const groupsByKey = new Map<string, EstimateGroup>();
  const titles: Record<string, string> = {
    panels: "Panels",
    posts: "Posts",
    gates: "Gates",
    concrete: "Concrete",
    "floodlight-columns": "Floodlight columns",
    "basketball-posts": "Basketball posts",
    plant: "Plant",
    "ancillary-items": "Ancillary items"
  };

  for (const section of workbook.sections) {
    for (const row of section.rows) {
      if (row.quantity <= 0 && row.total <= 0 && !row.notes) {
        continue;
      }
      const category = determineRowCategory(section, row);
      const groupKey =
        category === "PANELS"
          ? "panels"
          : category === "POSTS"
            ? "posts"
            : category === "GATES"
              ? "gates"
              : category === "CONCRETE"
                ? "concrete"
                : category === "FLOODLIGHT_COLUMNS"
                  ? "floodlight-columns"
                  : category === "BASKETBALL_POSTS"
                    ? "basketball-posts"
                    : category === "PLANT"
                      ? "plant"
                      : "ancillary-items";
      const group =
        groupsByKey.get(groupKey) ??
        {
          key: groupKey,
          title: titles[groupKey] ?? "Estimate items",
          rows: [],
          subtotalMaterialCost: 0,
          subtotalLabourCost: 0,
          subtotalCost: 0
        };
      const unitCost =
        row.rateMode === "VOLUME_PER_UNIT" ? roundMoney(row.rate * workbook.settings.concretePricePerCube) : row.rate;
      const estimateRow: EstimateRow = {
        key: `${section.key}:${row.code}`,
        itemCode: row.code,
        itemName: row.label,
        category,
        quantity: row.quantity,
        unit: row.unit,
        unitMaterialCost: section.sheet === "MATERIALS" && row.rateMode !== "REFERENCE" ? unitCost : 0,
        unitLabourCost: section.sheet === "LABOUR" ? unitCost : 0,
        totalMaterialCost: section.sheet === "MATERIALS" ? row.total : 0,
        totalLabourCost: section.sheet === "LABOUR" ? row.total : 0,
        totalCost: row.total,
        ...(row.notes ? { notes: row.notes } : {})
      };
      group.rows.push(estimateRow);
      group.subtotalMaterialCost = roundMoney(group.subtotalMaterialCost + estimateRow.totalMaterialCost);
      group.subtotalLabourCost = roundMoney(group.subtotalLabourCost + estimateRow.totalLabourCost);
      group.subtotalCost = roundMoney(group.subtotalCost + estimateRow.totalCost);
      groupsByKey.set(groupKey, group);
    }
  }

  if (ancillaryItems.length > 0) {
    const group =
      groupsByKey.get("ancillary-items") ??
      {
        key: "ancillary-items",
        title: "Ancillary items",
        rows: [],
        subtotalMaterialCost: 0,
        subtotalLabourCost: 0,
        subtotalCost: 0
      };
    for (const item of ancillaryItems) {
      const quantity = roundQuantity(item.quantity);
      const totalMaterialCost = roundMoney(quantity * item.materialCost);
      const totalLabourCost = roundMoney(quantity * item.labourCost);
      group.rows.push({
        key: item.id,
        itemCode: null,
        itemName: item.description,
        category: "ANCILLARY",
        quantity,
        unit: "item",
        unitMaterialCost: item.materialCost,
        unitLabourCost: item.labourCost,
        totalMaterialCost,
        totalLabourCost,
        totalCost: roundMoney(totalMaterialCost + totalLabourCost)
      });
      group.subtotalMaterialCost = roundMoney(group.subtotalMaterialCost + totalMaterialCost);
      group.subtotalLabourCost = roundMoney(group.subtotalLabourCost + totalLabourCost);
      group.subtotalCost = roundMoney(group.subtotalCost + totalMaterialCost + totalLabourCost);
    }
    groupsByKey.set("ancillary-items", group);
  }

  return [...groupsByKey.values()].filter((group) => group.rows.length > 0);
}

function buildWarnings(drawing: DrawingRecord, gateSummary: GateSummary): EstimateWarning[] {
  const warnings: EstimateWarning[] = [];
  if (drawing.layout.segments.some((segment) => segment.spec.system !== "TWIN_BAR")) {
    warnings.push({
      code: "UNSUPPORTED_FENCE_SYSTEM",
      message: "Workbook pricing is currently configured for Twin Bar schedules only. Review non-Twin Bar lines manually."
    });
  }

  const junctionAndInlineJoinCount = Object.values(drawing.estimate.posts.byHeightAndType).reduce(
    (sum, row) => sum + row.junction + row.inlineJoin,
    0
  );
  if (junctionAndInlineJoinCount > 0) {
    warnings.push({
      code: "INLINE_JOIN_OR_JUNCTION_POSTS",
      message: `${junctionAndInlineJoinCount} inline join / junction posts need manual review before quoting.`
    });
  }

  if (drawing.estimate.corners.unclassified > 0) {
    warnings.push({
      code: "UNCLASSIFIED_CORNERS",
      message: `${drawing.estimate.corners.unclassified} corners remain unclassified and should be checked before issuing a quote.`
    });
  }

  if (gateSummary.customGates > 0) {
    warnings.push({
      code: "CUSTOM_GATES",
      message: `${gateSummary.customGates} custom gates are excluded from the automatic workbook and need manual pricing.`
    });
  }

  return warnings;
}

export function buildWorkbookPricedEstimate(
  drawing: DrawingRecord,
  pricingConfig: PricingConfigRecord,
  ancillaryItems: AncillaryEstimateItem[] = [],
  manualEntries: EstimateWorkbookManualEntry[] = []
): PricedEstimateResult {
  const workbookConfig = getWorkbookConfig(pricingConfig);
  const manualEntryMap = new Map(manualEntries.map((entry) => [entry.code, entry.quantity] as const));
  const settings = {
    ...workbookConfig.settings,
    labourOverheadPercent: roundQuantity(
      manualEntryMap.get(COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE) ?? workbookConfig.settings.labourOverheadPercent
    ),
    travelLodgePerDay: roundMoney(
      manualEntryMap.get(COMMERCIAL_TRAVEL_RATE_CODE) ?? workbookConfig.settings.travelLodgePerDay
    ),
    markupRate: roundMoney(manualEntryMap.get(COMMERCIAL_MARKUP_RATE_CODE) ?? workbookConfig.settings.markupRate),
    distributionCharge: roundMoney(
      manualEntryMap.get(COMMERCIAL_DISTRIBUTION_CHARGE_CODE) ?? workbookConfig.settings.distributionCharge
    ),
    concretePricePerCube: roundMoney(
      manualEntryMap.get(COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE) ?? workbookConfig.settings.concretePricePerCube
    )
  };
  const panelLayerCounts = buildPanelLayerCounts(drawing);
  const gateSummary = buildGateSummary(drawing);
  const featureQuantityIndex = buildFeatureQuantityIndex(drawing);

  const sections: EstimateWorkbookSection[] = workbookConfig.sections.map((section) => {
    const rows = section.rows.map((row) =>
      buildWorkbookRow(
        section,
        row,
        drawing,
        manualEntryMap,
        panelLayerCounts,
        gateSummary,
        featureQuantityIndex,
        {
          ...workbookConfig,
          settings
        }
      )
    );
    return {
      key: section.key,
      sheet: section.sheet,
      title: section.title,
      ...(section.caption ? { caption: section.caption } : {}),
      subtotal: roundMoney(rows.reduce((sum, row) => sum + row.total, 0)),
      rows
    };
  });

  const materialsSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "MATERIALS").reduce((sum, section) => sum + section.subtotal, 0)
  );
  const labourSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "LABOUR").reduce((sum, section) => sum + section.subtotal, 0)
  );

  const commercialInputs: EstimateWorkbookCommercialInputs = {
    travelDays: roundQuantity(manualEntryMap.get(COMMERCIAL_TRAVEL_DAYS_CODE) ?? 0),
    markupUnits: roundQuantity(manualEntryMap.get(COMMERCIAL_MARKUP_UNITS_CODE) ?? 0)
  };
  const distributionCharge = drawing.layout.segments.length > 0 ? settings.distributionCharge : 0;
  const labourOverheadAmount = roundMoney(
    labourSubtotal * (settings.labourOverheadPercent / 100)
  );
  const travelTotal = roundMoney(commercialInputs.travelDays * settings.travelLodgePerDay);
  const markupTotal = roundMoney(commercialInputs.markupUnits * settings.markupRate);

  const ancillaryMaterialTotal = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0)
  );
  const ancillaryLabourTotal = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0)
  );

  const workbook: EstimateWorkbook = {
    settings,
    sections,
    manualEntries,
    commercialInputs,
    totals: {
      materialsSubtotal,
      labourSubtotal,
      labourOverheadPercent: settings.labourOverheadPercent,
      labourOverheadAmount,
      distributionCharge,
      travelDays: commercialInputs.travelDays,
      travelRatePerDay: settings.travelLodgePerDay,
      travelTotal,
      markupUnits: commercialInputs.markupUnits,
      markupRate: settings.markupRate,
      markupTotal,
      grandTotal: roundMoney(
        materialsSubtotal + distributionCharge + labourSubtotal + labourOverheadAmount + travelTotal + markupTotal
      )
    }
  };
  const groups = buildEstimateGroups(workbook, ancillaryItems);
  const materialCost = roundMoney(materialsSubtotal + distributionCharge + ancillaryMaterialTotal);
  const labourCost = roundMoney(labourSubtotal + labourOverheadAmount + travelTotal + markupTotal + ancillaryLabourTotal);

  return {
    drawing: {
      drawingId: drawing.id,
      drawingName: drawing.name,
      customerId: drawing.customerId,
      customerName: drawing.customerName
    },
    groups,
    ancillaryItems,
    manualEntries,
    workbook,
    totals: {
      materialCost,
      labourCost,
      totalCost: roundMoney(materialCost + labourCost)
    },
    warnings: buildWarnings(drawing, gateSummary),
    pricingSnapshot:
      pricingConfig.updatedByUserId === null
        ? {
            updatedAtIso: pricingConfig.updatedAtIso,
            updatedByUserId: null,
            source: "DEFAULT"
          }
        : {
            updatedAtIso: pricingConfig.updatedAtIso,
            updatedByUserId: pricingConfig.updatedByUserId,
            source: "COMPANY_CONFIG"
          }
  };
}
