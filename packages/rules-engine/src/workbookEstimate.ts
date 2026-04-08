import type {
  AncillaryEstimateItem,
  DrawingRecord,
  EstimateResult,
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
  PricedEstimateResult,
  TwinBarVariant,
} from "@fence-estimator/contracts";
import {
  buildDefaultPricingWorkbookConfig,
  COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
  COMMERCIAL_LABOUR_DAY_VALUE_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
  mergePricingWorkbookWithTemplate,
} from "@fence-estimator/contracts";

import {
  BASKETBALL_POST_BASE_MM,
  FLOODLIGHT_COLUMN_BASE_MM,
  calculateConcreteVolumeFromDimensionsMm,
  getConcreteRuleForHeight,
  getFenceHeightKeyForMm,
} from "./concretePricing.js";
import { getSpecConfig } from "./constants.js";
import {
  resolveBasketballFeaturePlacements,
  resolveGoalUnitPlacements,
  resolveKickboardAttachments,
  resolvePitchDividerPlacements,
  resolveSideNettingAttachments,
} from "./features.js";
import { estimateDrawingLayout } from "./drawing.js";

interface GroupBucket {
  key: string;
  title: string;
  sortOrder: number;
  rows: Map<string, EstimateRow>;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeTwinBarVariant(variant: TwinBarVariant | undefined): TwinBarVariant {
  return variant === "SUPER_REBOUND" ? "SUPER_REBOUND" : "STANDARD";
}

function incrementQuantity(map: Map<string, number>, key: string, amount: number): void {
  if (!Number.isFinite(amount) || Math.abs(amount) < Number.EPSILON) {
    return;
  }
  map.set(key, roundQuantity((map.get(key) ?? 0) + amount));
}

function getWorkbookConfig(pricingConfig: PricingConfigRecord): PricingWorkbookConfig {
  return mergePricingWorkbookWithTemplate(
    pricingConfig.workbook ?? buildDefaultPricingWorkbookConfig(),
  );
}

interface WorkbookEstimateOptions {
  externalCornersEnabled?: boolean | undefined;
}

function applyExternalCornerMode(
  estimate: EstimateResult,
  options: WorkbookEstimateOptions = {},
): EstimateResult {
  if (options.externalCornersEnabled !== false) {
    return estimate;
  }

  const byHeightMm = Object.fromEntries(
    Object.entries(estimate.corners.byHeightMm ?? {}).map(([heightMm, bucket]) => [
      heightMm,
      {
        ...bucket,
        internal: bucket.internal + bucket.external,
        external: 0,
      },
    ]),
  );

  return {
    ...estimate,
    corners: {
      ...estimate.corners,
      internal: estimate.corners.internal + estimate.corners.external,
      external: 0,
      byHeightMm,
    },
  };
}

function getCornerPricingBreakdown(
  drawing: DrawingRecord,
  options: WorkbookEstimateOptions = {},
): EstimateResult["corners"] {
  return applyExternalCornerMode(estimateDrawingLayout(drawing.layout), options).corners;
}

function buildCatalogQuantityMap(
  drawing: DrawingRecord,
  options: WorkbookEstimateOptions = {},
): Map<string, number> {
  const quantities = new Map<string, number>();
  const segmentsById = new Map(drawing.layout.segments.map((segment) => [segment.id, segment] as const));
  const cornerPricingBreakdown = getCornerPricingBreakdown(drawing, options);

  for (const segment of drawing.layout.segments) {
    if (segment.spec.system !== "TWIN_BAR") {
      continue;
    }
    const segmentLengthMm = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
    const bays = Math.max(1, Math.ceil(segmentLengthMm / getSpecConfig(segment.spec).bayWidthMm));
    const variant = normalizeTwinBarVariant(segment.spec.twinBarVariant);
    getSpecConfig(segment.spec).layers.forEach((layer, index) => {
      const lift = index === 0 ? "GROUND" : index === 1 ? "FIRST" : "SECOND";
      incrementQuantity(
        quantities,
        `panel:${segment.spec.height}:${layer.heightMm}:${lift}:${variant}`,
        bays,
      );
    });
  }

  for (const [heightKey, bucket] of Object.entries(
    drawing.estimate.materials.twinBarPanelsByFenceHeight,
  )) {
    incrementQuantity(quantities, `top-rail:${heightKey}`, bucket.total);
  }

  for (const [heightMm, bucket] of Object.entries(drawing.estimate.posts.byHeightAndType)) {
    const fenceHeightKey = getFenceHeightKeyForMm(Number(heightMm));
    const concretePerHoleM3 = fenceHeightKey
      ? calculateConcreteVolumeFromDimensionsMm(getConcreteRuleForHeight(fenceHeightKey))
      : 0;
    for (const postType of ["end", "intermediate", "junction", "inlineJoin"] as const) {
      const count = bucket[postType] ?? 0;
      incrementQuantity(quantities, `post:${heightMm}:${postType}:count`, count);
      incrementQuantity(quantities, `post:${heightMm}:${postType}:holes`, count);
      incrementQuantity(
        quantities,
        `post:${heightMm}:${postType}:concrete-m3`,
        count * concretePerHoleM3,
      );
      incrementQuantity(quantities, "holes:total", count);
    }

    const cornerCount = bucket.corner ?? 0;
    const cornerBucket = cornerPricingBreakdown.byHeightMm?.[heightMm];
    const classifiedCornerCount =
      (cornerBucket?.internal ?? 0) + (cornerBucket?.external ?? 0) + (cornerBucket?.unclassified ?? 0);
    const unclassifiedCornerCount =
      (cornerBucket?.unclassified ?? 0) + Math.max(0, cornerCount - classifiedCornerCount);
    const internalCornerCount =
      cornerBucket ? cornerBucket.internal + unclassifiedCornerCount : cornerCount;
    const externalCornerCount = cornerBucket?.external ?? 0;

    incrementQuantity(quantities, `post:${heightMm}:corner:count`, cornerCount);
    incrementQuantity(quantities, `post:${heightMm}:corner:holes`, cornerCount);
    incrementQuantity(
      quantities,
      `post:${heightMm}:corner:concrete-m3`,
      cornerCount * concretePerHoleM3,
    );
    incrementQuantity(quantities, "holes:total", cornerCount);

    for (const [cornerType, count] of [
      ["cornerInternal", internalCornerCount],
      ["cornerExternal", externalCornerCount],
    ] as const) {
      incrementQuantity(quantities, `post:${heightMm}:${cornerType}:count`, count);
      incrementQuantity(quantities, `post:${heightMm}:${cornerType}:holes`, count);
      incrementQuantity(
        quantities,
        `post:${heightMm}:${cornerType}:concrete-m3`,
        count * concretePerHoleM3,
      );
    }
  }

  for (const gate of drawing.layout.gates ?? []) {
    if (gate.gateType === "CUSTOM") {
      continue;
    }
    const segment = segmentsById.get(gate.segmentId);
    if (!segment) {
      continue;
    }
    const countKey = `gate:${segment.spec.height}:${gate.gateType}:count`;
    const concretePerHoleM3 =
      segment.spec.system === "TWIN_BAR"
        ? calculateConcreteVolumeFromDimensionsMm(getConcreteRuleForHeight(segment.spec.height))
        : 0;
    incrementQuantity(quantities, countKey, 1);
    incrementQuantity(quantities, `gate:${segment.spec.height}:${gate.gateType}:holes`, 2);
    incrementQuantity(
      quantities,
      `gate:${segment.spec.height}:${gate.gateType}:concrete-m3`,
      concretePerHoleM3 * 2,
    );
    incrementQuantity(quantities, "holes:total", 2);
  }

  const resolvedGoalUnits = resolveGoalUnitPlacements(
    segmentsById,
    drawing.layout.goalUnits ?? [],
  );
  for (const goalUnit of resolvedGoalUnits) {
    incrementQuantity(
      quantities,
      goalUnit.hasBasketballPost
        ? `goal-unit:${goalUnit.widthMm}:${goalUnit.goalHeightMm}:basketball:count`
        : `goal-unit:${goalUnit.widthMm}:${goalUnit.goalHeightMm}:count`,
      1,
    );
  }

  const resolvedBasketballFeatures = resolveBasketballFeaturePlacements(
    segmentsById,
    drawing.layout.basketballFeatures ?? drawing.layout.basketballPosts ?? [],
  );
  const basketballConcreteM3 = calculateConcreteVolumeFromDimensionsMm(BASKETBALL_POST_BASE_MM);
  for (const feature of resolvedBasketballFeatures) {
    if (feature.type === "DEDICATED_POST") {
      incrementQuantity(
        quantities,
        `basketball:dedicated:${feature.armLengthMm ?? 0}:count`,
        1,
      );
      incrementQuantity(quantities, `basketball:dedicated:${feature.armLengthMm ?? 0}:holes`, 1);
      incrementQuantity(
        quantities,
        `basketball:dedicated:${feature.armLengthMm ?? 0}:concrete-m3`,
        basketballConcreteM3,
      );
      incrementQuantity(quantities, "holes:total", 1);
      continue;
    }
    if (feature.type === "MOUNTED_TO_EXISTING_POST") {
      incrementQuantity(quantities, "basketball:mounted:count", 1);
      continue;
    }
    incrementQuantity(quantities, "basketball:goal-unit-integrated:count", 1);
  }

  const floodlightColumns = drawing.layout.floodlightColumns ?? [];
  if (floodlightColumns.length > 0) {
    for (const floodlightColumn of floodlightColumns) {
      const heightMm = Math.round(floodlightColumn.heightMm ?? 6000);
      incrementQuantity(quantities, `floodlight:column:${heightMm}:count`, 1);
      incrementQuantity(quantities, `floodlight:column:${heightMm}:holes`, 1);
      incrementQuantity(
        quantities,
        `floodlight:column:${heightMm}:concrete-m3`,
        calculateConcreteVolumeFromDimensionsMm(FLOODLIGHT_COLUMN_BASE_MM),
      );
      incrementQuantity(quantities, "holes:total", 1);
    }
  }

  const resolvedKickboards = resolveKickboardAttachments(
    segmentsById,
    drawing.layout.kickboards ?? [],
    resolvedGoalUnits,
  );
  const kickboardsByAttachmentId = new Map<string, (typeof resolvedKickboards)[number]>();
  for (const kickboard of resolvedKickboards) {
    const existing = kickboardsByAttachmentId.get(kickboard.sourceAttachmentId);
    if (!existing || kickboard.boardCount > existing.boardCount) {
      kickboardsByAttachmentId.set(kickboard.sourceAttachmentId, kickboard);
    }
  }
  for (const kickboard of kickboardsByAttachmentId.values()) {
    incrementQuantity(
      quantities,
      `kickboard:${kickboard.placement.sectionHeightMm}:${kickboard.placement.thicknessMm}:${kickboard.placement.profile}:${kickboard.placement.boardLengthMm}:boards`,
      kickboard.boardCount,
    );
  }

  const resolvedPitchDividers = resolvePitchDividerPlacements(
    segmentsById,
    drawing.layout.pitchDividers ?? [],
  );
  for (const divider of resolvedPitchDividers) {
    if (!divider.isValid) {
      continue;
    }
    incrementQuantity(quantities, "pitch-divider:span-m", divider.spanMm / 1000);
    incrementQuantity(quantities, "pitch-divider:holes", divider.supportPostCount + 2);
    incrementQuantity(quantities, "holes:total", divider.supportPostCount + 2);
  }

  const resolvedSideNettings = resolveSideNettingAttachments(
    segmentsById,
    drawing.layout.sideNettings ?? [],
  );
  for (const sideNetting of resolvedSideNettings) {
    incrementQuantity(
      quantities,
      `side-netting:${sideNetting.additionalHeightMm}:area-m2`,
      (sideNetting.lengthMm / 1000) * (sideNetting.additionalHeightMm / 1000),
    );
  }

  return quantities;
}

function calculateRowQuantity(
  row: PricingWorkbookRow,
  quantityMap: Map<string, number>,
  manualEntryMap: Map<string, number>,
): number {
  if (row.quantityRule.kind === "MANUAL_ENTRY") {
    return roundQuantity(manualEntryMap.get(row.code) ?? row.quantityRule.defaultQuantity ?? 0);
  }
  return roundQuantity(quantityMap.get(row.quantityRule.quantityKey) ?? 0);
}

function buildWorkbookRow(
  section: PricingWorkbookConfig["sections"][number],
  row: PricingWorkbookRow,
  quantityMap: Map<string, number>,
  manualEntryMap: Map<string, number>,
  workbookConfig: PricingWorkbookConfig,
): EstimateWorkbookRow {
  const quantity = calculateRowQuantity(row, quantityMap, manualEntryMap);
  const concreteQuantity = roundQuantity(
    row.concreteQuantityKey ? quantityMap.get(row.concreteQuantityKey) ?? 0 : 0,
  );
  const holeQuantity = roundQuantity(
    row.holeQuantityKey ? quantityMap.get(row.holeQuantityKey) ?? 0 : 0,
  );
  const rateMode = row.rateMode ?? "MONEY";
  const baseTotal =
    rateMode === "REFERENCE"
      ? 0
      : rateMode === "VOLUME_PER_UNIT"
        ? quantity * row.rate * workbookConfig.settings.concretePricePerCube
        : quantity * row.rate;
  const concreteTotal =
    section.sheet === "MATERIALS"
      ? concreteQuantity * workbookConfig.settings.concretePricePerCube
      : 0;

  return {
    code: row.code,
    label: row.label,
    unit: row.unit,
    quantity,
    rate: row.rate,
    rateMode,
    total: roundMoney(baseTotal + concreteTotal),
    isEditable: row.quantityRule.kind === "MANUAL_ENTRY",
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.tone ? { tone: row.tone } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.presentation ? { presentation: row.presentation } : {}),
    ...(row.concreteQuantityKey ? { concreteQuantityKey: row.concreteQuantityKey } : {}),
    ...(concreteQuantity > 0 ? { concreteQuantity } : {}),
    ...(row.holeQuantityKey ? { holeQuantityKey: row.holeQuantityKey } : {}),
    ...(holeQuantity > 0 ? { holeQuantity } : {}),
  };
}

function buildCommercialRows(workbook: EstimateWorkbook): EstimateRow[] {
  const rows: EstimateRow[] = [];
  const labourDays = workbook.totals.labourDays ?? 0;
  const holeCount = workbook.totals.holeCount ?? 0;

  const maybePush = (
    key: string,
    itemName: string,
    quantity: number,
    unit: string,
    unitLabourCost: number,
    totalLabourCost: number,
  ): void => {
    if (quantity <= 0 && totalLabourCost <= 0) {
      return;
    }
    rows.push({
      key,
      itemCode: null,
      itemName,
      category: "COMMERCIAL",
      quantity: roundQuantity(quantity),
      unit,
      unitMaterialCost: 0,
      unitLabourCost: roundMoney(unitLabourCost),
      totalMaterialCost: 0,
      totalLabourCost: roundMoney(totalLabourCost),
      totalCost: roundMoney(totalLabourCost),
    });
  };

  maybePush(
    "commercial:distribution",
    "Distribution charge",
    workbook.totals.distributionCharge > 0 ? 1 : 0,
    "charge",
    workbook.totals.distributionCharge,
    workbook.totals.distributionCharge,
  );
  maybePush(
    "commercial:hard-dig",
    "Hard dig",
    holeCount,
    "hole",
    workbook.totals.hardDigRatePerHole ?? 0,
    workbook.totals.hardDigTotal ?? 0,
  );
  maybePush(
    "commercial:clear-spoils",
    "Clear spoils",
    holeCount,
    "hole",
    workbook.totals.clearSpoilsRatePerHole ?? 0,
    workbook.totals.clearSpoilsTotal ?? 0,
  );
  maybePush(
    "commercial:travel-lodge",
    "Travel and lodge",
    labourDays,
    "day",
    workbook.totals.travelRatePerDay ?? 0,
    workbook.totals.travelTotal,
  );
  maybePush(
    "commercial:markup",
    "Markup",
    labourDays,
    "day",
    workbook.totals.markupRate,
    workbook.totals.markupTotal,
  );

  return rows;
}

function sortEstimateRows(left: EstimateRow, right: EstimateRow): number {
  if (left.itemName === right.itemName) {
    return left.key.localeCompare(right.key, "en-GB", { numeric: true });
  }
  return left.itemName.localeCompare(right.itemName, "en-GB", { numeric: true });
}

function buildEstimateGroups(
  workbook: EstimateWorkbook,
  ancillaryItems: AncillaryEstimateItem[],
): EstimateGroup[] {
  const groups = new Map<string, GroupBucket>();

  const upsertGroup = (key: string, title: string, sortOrder: number): GroupBucket => {
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const created: GroupBucket = { key, title, sortOrder, rows: new Map() };
    groups.set(key, created);
    return created;
  };

  for (const section of workbook.sections) {
    for (const row of section.rows) {
      if (row.quantity <= 0 && row.total <= 0 && !row.notes) {
        continue;
      }
      const groupKey = row.presentation?.groupKey ?? row.category?.toLowerCase() ?? "estimate";
      const groupTitle = row.presentation?.groupTitle ?? "Estimate items";
      const groupSortOrder = row.presentation?.sortOrder ?? 9999;
      const rowKey = row.presentation?.pairKey ?? `${section.key}:${row.code}`;
      const bucket = upsertGroup(groupKey, groupTitle, groupSortOrder);
      const existing =
        bucket.rows.get(rowKey) ??
        ({
          key: rowKey,
          itemCode: null,
          itemName: row.label,
          category: row.category ?? ("ANCILLARY" as PricingItemCategory),
          quantity: row.quantity,
          unit: row.unit,
          unitMaterialCost: 0,
          unitLabourCost: 0,
          totalMaterialCost: 0,
          totalLabourCost: 0,
          totalCost: 0,
          ...(row.notes ? { notes: row.notes } : {}),
        } satisfies EstimateRow);

      const unitCost = row.quantity > 0 ? roundMoney(row.total / row.quantity) : 0;
      existing.quantity = Math.max(existing.quantity, row.quantity);
      existing.unit = row.unit;
      existing.itemCode = existing.itemCode ?? row.code;
      existing.category = row.category ?? existing.category;
      if (row.notes && !existing.notes) {
        existing.notes = row.notes;
      }

      if (section.sheet === "MATERIALS") {
        existing.unitMaterialCost = unitCost;
        existing.totalMaterialCost = row.total;
      } else {
        existing.unitLabourCost = unitCost;
        existing.totalLabourCost = row.total;
      }

      existing.totalCost = roundMoney(existing.totalMaterialCost + existing.totalLabourCost);
      bucket.rows.set(rowKey, existing);
    }
  }

  const commercialRows = buildCommercialRows(workbook);
  if (commercialRows.length > 0) {
    const bucket = upsertGroup("commercial", "Commercial additions", 9_000);
    for (const row of commercialRows) {
      bucket.rows.set(row.key, row);
    }
  }

  if (ancillaryItems.length > 0) {
    const bucket = upsertGroup("ancillary-items", "Ancillary items", 9_100);
    for (const item of ancillaryItems) {
      const quantity = roundQuantity(item.quantity);
      const totalMaterialCost = roundMoney(quantity * item.materialCost);
      const totalLabourCost = roundMoney(quantity * item.labourCost);
      bucket.rows.set(item.id, {
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
        totalCost: roundMoney(totalMaterialCost + totalLabourCost),
      });
    }
  }

  return [...groups.values()]
    .map((group) => {
      const rows = [...group.rows.values()].sort(sortEstimateRows);
      return {
        key: group.key,
        title: group.title,
        rows,
        subtotalMaterialCost: roundMoney(
          rows.reduce((sum, row) => sum + row.totalMaterialCost, 0),
        ),
        subtotalLabourCost: roundMoney(
          rows.reduce((sum, row) => sum + row.totalLabourCost, 0),
        ),
        subtotalCost: roundMoney(rows.reduce((sum, row) => sum + row.totalCost, 0)),
      };
    })
    .filter((group) => group.rows.length > 0)
    .sort((left, right) => {
      const leftOrder = groups.get(left.key)?.sortOrder ?? 9999;
      const rightOrder = groups.get(right.key)?.sortOrder ?? 9999;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.title.localeCompare(right.title, "en-GB", { numeric: true });
    });
}

function buildWarnings(drawing: DrawingRecord): EstimateWarning[] {
  const warnings: EstimateWarning[] = [];
  if (drawing.layout.segments.some((segment) => segment.spec.system !== "TWIN_BAR")) {
    warnings.push({
      code: "UNSUPPORTED_FENCE_SYSTEM",
      message:
        "Workbook pricing is currently configured for Twin Bar schedules only. Review non-Twin Bar lines manually.",
    });
  }

  const junctionAndInlineJoinCount = Object.values(drawing.estimate.posts.byHeightAndType).reduce(
    (sum, row) => sum + row.junction + row.inlineJoin,
    0,
  );
  if (junctionAndInlineJoinCount > 0) {
    warnings.push({
      code: "INLINE_JOIN_OR_JUNCTION_POSTS",
      message: `${junctionAndInlineJoinCount} inline join / junction posts need manual review before quoting.`,
    });
  }

  if (drawing.estimate.corners.unclassified > 0) {
    warnings.push({
      code: "UNCLASSIFIED_CORNERS",
      message: `${drawing.estimate.corners.unclassified} corners remain unclassified and should be checked before issuing a quote.`,
    });
  }

  const customGateCount = (drawing.layout.gates ?? []).filter((gate) => gate.gateType === "CUSTOM")
    .length;
  if (customGateCount > 0) {
    warnings.push({
      code: "CUSTOM_GATES",
      message: `${customGateCount} custom gates are excluded from the automatic workbook and need manual pricing.`,
    });
  }

  return warnings;
}

export function buildWorkbookPricedEstimate(
  drawing: DrawingRecord,
  pricingConfig: PricingConfigRecord,
  ancillaryItems: AncillaryEstimateItem[] = [],
  manualEntries: EstimateWorkbookManualEntry[] = [],
  options: WorkbookEstimateOptions = {},
): PricedEstimateResult {
  const workbookConfig = getWorkbookConfig(pricingConfig);
  const manualEntryMap = new Map(manualEntries.map((entry) => [entry.code, entry.quantity] as const));
  const settings = {
    ...workbookConfig.settings,
    labourDayValue: roundQuantity(
      manualEntryMap.get(COMMERCIAL_LABOUR_DAY_VALUE_CODE) ??
        workbookConfig.settings.labourDayValue ??
        205,
    ),
    travelLodgePerDay: roundMoney(
      manualEntryMap.get(COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE) ??
        workbookConfig.settings.travelLodgePerDay,
    ),
    markupRate: roundMoney(
      manualEntryMap.get(COMMERCIAL_MARKUP_RATE_CODE) ?? workbookConfig.settings.markupRate,
    ),
    distributionCharge: roundMoney(
      manualEntryMap.get(COMMERCIAL_DISTRIBUTION_CHARGE_CODE) ??
        workbookConfig.settings.distributionCharge,
    ),
    concretePricePerCube: roundMoney(
      manualEntryMap.get(COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE) ??
        workbookConfig.settings.concretePricePerCube,
    ),
    hardDigRatePerHole: roundMoney(
      manualEntryMap.get(COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE) ??
        workbookConfig.settings.hardDigRatePerHole ??
        0,
    ),
    clearSpoilsRatePerHole: roundMoney(
      manualEntryMap.get(COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE) ??
        workbookConfig.settings.clearSpoilsRatePerHole ??
        0,
    ),
  };
  const quantityMap = buildCatalogQuantityMap(drawing, options);

  const sections: EstimateWorkbookSection[] = workbookConfig.sections.map((section) => {
    const rows = section.rows.map((row) =>
      buildWorkbookRow(section, row, quantityMap, manualEntryMap, {
        ...workbookConfig,
        settings,
      }),
    );
    return {
      key: section.key,
      sheet: section.sheet,
      title: section.title,
      ...(section.caption ? { caption: section.caption } : {}),
      subtotal: roundMoney(rows.reduce((sum, row) => sum + row.total, 0)),
      rows,
    };
  });

  const materialsSubtotal = roundMoney(
    sections
      .filter((section) => section.sheet === "MATERIALS")
      .reduce((sum, section) => sum + section.subtotal, 0),
  );
  const labourSubtotal = roundMoney(
    sections
      .filter((section) => section.sheet === "LABOUR")
      .reduce((sum, section) => sum + section.subtotal, 0),
  );
  const holeCount = roundQuantity(
    sections
      .flatMap((section) => section.rows)
      .reduce((sum, row) => sum + (row.holeQuantity ?? 0), 0),
  );
  const hasBillableWork = materialsSubtotal > 0 || labourSubtotal > 0;
  const distributionCharge = hasBillableWork ? settings.distributionCharge : 0;
  const hardDigTotal = roundMoney(holeCount * (settings.hardDigRatePerHole ?? 0));
  const clearSpoilsTotal = roundMoney(holeCount * (settings.clearSpoilsRatePerHole ?? 0));
  const labourBaseForDays = roundMoney(
    labourSubtotal + distributionCharge + hardDigTotal + clearSpoilsTotal,
  );
  const labourDays =
    labourBaseForDays > 0 ? Math.ceil(labourBaseForDays / Math.max(settings.labourDayValue ?? 205, 1)) : 0;
  const travelTotal = roundMoney(labourDays * settings.travelLodgePerDay);
  const markupTotal = roundMoney(labourDays * settings.markupRate);

  const ancillaryMaterialTotal = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0),
  );
  const ancillaryLabourTotal = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0),
  );

  const commercialInputs: EstimateWorkbookCommercialInputs = {
    labourDayValue: settings.labourDayValue,
    labourDays,
    travelLodgePerDay: settings.travelLodgePerDay,
    travelDays: labourDays,
    markupRate: settings.markupRate,
    markupUnits: labourDays,
    distributionCharge,
    concretePricePerCube: settings.concretePricePerCube,
    hardDigRatePerHole: settings.hardDigRatePerHole,
    clearSpoilsRatePerHole: settings.clearSpoilsRatePerHole,
    holeCount,
  };

  const workbook: EstimateWorkbook = {
    settings,
    sections,
    manualEntries,
    commercialInputs,
    totals: {
      materialsSubtotal,
      labourSubtotal,
      labourOverheadPercent: settings.labourOverheadPercent,
      labourOverheadAmount: 0,
      distributionCharge,
      travelDays: labourDays,
      travelRatePerDay: settings.travelLodgePerDay,
      travelTotal,
      markupUnits: labourDays,
      markupRate: settings.markupRate,
      markupTotal,
      labourDayValue: settings.labourDayValue,
      labourDays,
      holeCount,
      hardDigRatePerHole: settings.hardDigRatePerHole,
      hardDigTotal,
      clearSpoilsRatePerHole: settings.clearSpoilsRatePerHole,
      clearSpoilsTotal,
      grandTotal: roundMoney(
        materialsSubtotal + labourBaseForDays + travelTotal + markupTotal,
      ),
    },
  };
  const groups = buildEstimateGroups(workbook, ancillaryItems);

  return {
    drawing: {
      drawingId: drawing.id,
      drawingName: drawing.name,
      customerId: drawing.customerId,
      customerName: drawing.customerName,
    },
    groups,
    ancillaryItems,
    manualEntries,
    workbook,
    totals: {
      materialCost: roundMoney(materialsSubtotal + ancillaryMaterialTotal),
      labourCost: roundMoney(
        labourBaseForDays + travelTotal + markupTotal + ancillaryLabourTotal,
      ),
      totalCost: roundMoney(
        workbook.totals.grandTotal + ancillaryMaterialTotal + ancillaryLabourTotal,
      ),
    },
    warnings: buildWarnings(drawing),
    pricingSnapshot:
      pricingConfig.updatedByUserId === null
        ? {
            updatedAtIso: pricingConfig.updatedAtIso,
            updatedByUserId: null,
            source: "DEFAULT",
          }
        : {
            updatedAtIso: pricingConfig.updatedAtIso,
            updatedByUserId: pricingConfig.updatedByUserId,
            source: "COMPANY_CONFIG",
          },
  };
}
