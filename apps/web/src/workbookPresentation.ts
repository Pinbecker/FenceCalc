import type {
  EstimateWorkbook,
  EstimateWorkbookRow,
  PricingWorkbookConfig,
  PricingWorkbookRow,
} from "@fence-estimator/contracts";

export type NumericPricingSettingKey = "concretePricePerCube";

export interface PricingRateEditorRow {
  key: string;
  label: string;
  unit: string;
  materialRate: number | null;
  labourRate: number | null;
  materialCode?: string | undefined;
  labourCode?: string | undefined;
  materialSettingKey?: NumericPricingSettingKey | undefined;
  notes?: string | undefined;
}

export interface PricingRateGroup {
  key: string;
  title: string;
  rows: PricingRateEditorRow[];
}

export interface EstimateDisplayRow {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  rate: number;
  total: number;
  isEditable: boolean;
  notes?: string | undefined;
}

export interface EstimateDisplaySection {
  key: string;
  title: string;
  subtotal: number;
  rows: EstimateDisplayRow[];
}

interface RateGroupBucket {
  key: string;
  title: string;
  sortOrder: number;
  rows: Map<string, PricingRateEditorRow>;
}

interface EstimateSectionBucket {
  key: string;
  title: string;
  sortOrder: number;
  rows: Array<EstimateDisplayRow & { sortOrder: number }>;
}

const HEIGHT_SECTION_SORT_ORDER = [1200, 1800, 2000, 2400, 3000, 4000, 4500, 5000, 6000];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortRowsByLabel<T extends { key: string; label: string }>(left: T, right: T): number {
  if (left.label === right.label) {
    return left.key.localeCompare(right.key, "en-GB", { numeric: true });
  }
  return left.label.localeCompare(right.label, "en-GB", { numeric: true });
}

function buildRowUnitRate(row: EstimateWorkbookRow, workbook: EstimateWorkbook): number {
  if (row.quantity > 0 && row.concreteQuantity && row.concreteQuantity > 0) {
    return roundMoney(row.total / row.quantity);
  }
  if (row.rateMode === "VOLUME_PER_UNIT") {
    return roundMoney(row.rate * workbook.settings.concretePricePerCube);
  }
  return row.rate;
}

function buildPairKey(row: PricingWorkbookRow): string {
  return row.presentation?.pairKey ?? row.code;
}

export function buildPricingRateGroups(workbook: PricingWorkbookConfig): PricingRateGroup[] {
  const groups = new Map<string, RateGroupBucket>();

  for (const section of workbook.sections) {
    for (const row of section.rows) {
      if (!row.presentation) {
        continue;
      }
      const group =
        groups.get(row.presentation.groupKey) ??
        {
          key: row.presentation.groupKey,
          title: row.presentation.groupTitle,
          sortOrder: row.presentation.sortOrder,
          rows: new Map<string, PricingRateEditorRow>(),
        };
      const pairKey = buildPairKey(row);
      const existing =
        group.rows.get(pairKey) ??
        {
          key: pairKey,
          label: row.label,
          unit: row.unit,
          materialRate: null,
          labourRate: null,
          ...(row.notes ? { notes: row.notes } : {}),
        };
      if (section.sheet === "MATERIALS") {
        existing.materialRate = row.rate;
        existing.materialCode = row.code;
      } else {
        existing.labourRate = row.rate;
        existing.labourCode = row.code;
      }
      if (row.notes && !existing.notes) {
        existing.notes = row.notes;
      }
      group.rows.set(pairKey, existing);
      groups.set(group.key, group);
    }
  }

  const concreteGroup: PricingRateGroup = {
    key: "commercial-concrete",
    title: "Concrete",
    rows: [
      {
        key: "concrete-price-per-cube",
        label: "Concrete price per cube",
        unit: "m3",
        materialRate: workbook.settings.concretePricePerCube,
        labourRate: null,
        materialSettingKey: "concretePricePerCube",
      },
    ],
  };

  return [
    ...[...groups.values()]
      .map((group) => ({
        key: group.key,
        title: group.title,
        rows: [...group.rows.values()].sort(sortRowsByLabel),
        sortOrder: group.sortOrder,
      }))
      .filter((group) => group.rows.length > 0)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title))
      .map((group) => ({
        key: group.key,
        title: group.title,
        rows: group.rows,
      })),
    concreteGroup,
  ];
}

function buildCommercialLabourRows(workbook: EstimateWorkbook): EstimateDisplayRow[] {
  const labourDays = workbook.totals.labourDays ?? 0;
  const holeCount = workbook.totals.holeCount ?? 0;
  const rows: EstimateDisplayRow[] = [];

  const maybePush = (
    key: string,
    label: string,
    quantity: number,
    unit: string,
    rate: number,
    total: number,
  ): void => {
    if (quantity <= 0 && total <= 0) {
      return;
    }
    rows.push({
      key,
      label,
      unit,
      quantity,
      rate: roundMoney(rate),
      total: roundMoney(total),
      isEditable: false,
    });
  };

  maybePush(
    "commercial-distribution",
    "Distribution charge",
    workbook.totals.distributionCharge > 0 ? 1 : 0,
    "charge",
    workbook.totals.distributionCharge,
    workbook.totals.distributionCharge,
  );
  maybePush(
    "commercial-hard-dig",
    "Hard dig",
    holeCount,
    "hole",
    workbook.totals.hardDigRatePerHole ?? 0,
    workbook.totals.hardDigTotal ?? 0,
  );
  maybePush(
    "commercial-clear-spoils",
    "Clear spoils",
    holeCount,
    "hole",
    workbook.totals.clearSpoilsRatePerHole ?? 0,
    workbook.totals.clearSpoilsTotal ?? 0,
  );
  maybePush(
    "commercial-travel-lodge",
    "Travel and lodge",
    labourDays,
    "day",
    workbook.totals.travelRatePerDay ?? 0,
    workbook.totals.travelTotal,
  );
  maybePush(
    "commercial-markup",
    "Markup",
    labourDays,
    "day",
    workbook.totals.markupRate,
    workbook.totals.markupTotal,
  );

  return rows;
}

function formatFenceHeightLabel(heightMm: number): string {
  return `${(heightMm / 1000).toFixed(2).replace(/\.?0+$/, "")}m`;
}

function fenceHeightKeyToMm(heightKey: string): number {
  return Math.round(Number.parseFloat(heightKey) * 1000);
}

function getHeightSectionSortOrder(heightMm: number, sectionOffset: number): number {
  const index = HEIGHT_SECTION_SORT_ORDER.indexOf(heightMm);
  const baseOrder = index >= 0 ? index * 10 : 5000 + heightMm;
  return baseOrder + sectionOffset;
}

interface DisplayBucketMeta {
  bucketKey: string;
  bucketTitle: string;
  bucketSortOrder: number;
  rowSortOrder: number;
}

function buildDefaultBucketMeta(row: EstimateWorkbookRow): DisplayBucketMeta {
  return {
    bucketKey: row.presentation?.groupKey ?? "estimate",
    bucketTitle: row.presentation?.groupTitle ?? "Estimate items",
    bucketSortOrder: row.presentation?.sortOrder ?? 9999,
    rowSortOrder: 9999,
  };
}

function parseDisplayBucketMeta(row: EstimateWorkbookRow): DisplayBucketMeta {
  const panelMatch = row.code.match(
    /^(?:MAT|LAB)_PANEL_([^_]+)_(\d+)_(GROUND|FIRST|SECOND)_(STANDARD|SUPER_REBOUND)$/,
  );
  if (panelMatch) {
    const [, fenceHeightKey, panelHeightMmRaw, lift, variant] = panelMatch;
    if (!fenceHeightKey || !panelHeightMmRaw || !lift || !variant) {
      return buildDefaultBucketMeta(row);
    }
    const heightMm = fenceHeightKeyToMm(fenceHeightKey);
    const panelHeightMm = Number(panelHeightMmRaw);
    const variantOrder = variant === "STANDARD" ? 0 : 20_000;
    const liftOrder = lift === "GROUND" ? 0 : lift === "FIRST" ? 5_000 : 10_000;
    return {
      bucketKey: `height-${heightMm}-panels`,
      bucketTitle: `${formatFenceHeightLabel(heightMm)} panels`,
      bucketSortOrder: getHeightSectionSortOrder(heightMm, 1),
      rowSortOrder: variantOrder + liftOrder + panelHeightMm,
    };
  }

  const topRailMatch = row.code.match(/^(?:MAT|LAB)_TOP_RAIL_([^_]+)$/);
  if (topRailMatch) {
    const heightKey = topRailMatch[1];
    if (!heightKey) {
      return buildDefaultBucketMeta(row);
    }
    const heightMm = fenceHeightKeyToMm(heightKey);
    return {
      bucketKey: `height-${heightMm}-posts`,
      bucketTitle: `${formatFenceHeightLabel(heightMm)} posts & gates`,
      bucketSortOrder: getHeightSectionSortOrder(heightMm, 0),
      rowSortOrder: 60,
    };
  }

  const postMatch = row.code.match(
    /^(?:MAT|LAB)_POST_(\d+)_(END|INTERMEDIATE|CORNER|JUNCTION|INLINEJOIN)$/,
  );
  if (postMatch) {
    const [, heightMmRaw, postType] = postMatch;
    const heightMm = Number(heightMmRaw);
    const rowSortOrder =
      postType === "END"
        ? 10
        : postType === "INTERMEDIATE"
          ? 20
          : postType === "CORNER"
            ? 30
            : postType === "JUNCTION"
              ? 40
              : 50;
    return {
      bucketKey: `height-${heightMm}-posts`,
      bucketTitle: `${formatFenceHeightLabel(heightMm)} posts & gates`,
      bucketSortOrder: getHeightSectionSortOrder(heightMm, 0),
      rowSortOrder,
    };
  }

  const gateMatch = row.code.match(/^(?:MAT|LAB)_GATE_([^_]+)_(SINGLE_LEAF|DOUBLE_LEAF)$/);
  if (gateMatch) {
    const [, fenceHeightKey, gateType] = gateMatch;
    if (!fenceHeightKey || !gateType) {
      return buildDefaultBucketMeta(row);
    }
    const heightMm = fenceHeightKeyToMm(fenceHeightKey);
    return {
      bucketKey: `height-${heightMm}-posts`,
      bucketTitle: `${formatFenceHeightLabel(heightMm)} posts & gates`,
      bucketSortOrder: getHeightSectionSortOrder(heightMm, 0),
      rowSortOrder: gateType === "SINGLE_LEAF" ? 70 : 80,
    };
  }

  const kickboardMatch = row.code.match(/^(?:MAT|LAB)_KICKBOARD_(\d+)_(SQUARE|CHAMFERED)$/);
  if (kickboardMatch) {
    const [, sectionHeightMmRaw, profile] = kickboardMatch;
    const sectionHeightMm = Number(sectionHeightMmRaw);
    return {
      bucketKey: row.presentation?.groupKey ?? "kickboards",
      bucketTitle: row.presentation?.groupTitle ?? "Kickboards",
      bucketSortOrder: row.presentation?.sortOrder ?? 8300,
      rowSortOrder: sectionHeightMm + (profile === "SQUARE" ? 0 : 1000),
    };
  }

  const sideNettingMatch = row.code.match(/^(?:MAT|LAB)_SIDE_NETTING_(\d+)$/);
  if (sideNettingMatch) {
    return {
      bucketKey: row.presentation?.groupKey ?? "side-netting",
      bucketTitle: row.presentation?.groupTitle ?? "Side netting",
      bucketSortOrder: row.presentation?.sortOrder ?? 8500,
      rowSortOrder: Number(sideNettingMatch[1]),
    };
  }

  return buildDefaultBucketMeta(row);
}

export function buildEstimateDisplaySections(
  workbook: EstimateWorkbook,
  sheet: "MATERIALS" | "LABOUR",
): EstimateDisplaySection[] {
  const buckets = new Map<string, EstimateSectionBucket>();

  const upsertBucket = (key: string, title: string, sortOrder: number): EstimateSectionBucket => {
    const existing = buckets.get(key);
    if (existing) {
      return existing;
    }
    const created = {
      key,
      title,
      sortOrder,
      rows: [] as Array<EstimateDisplayRow & { sortOrder: number }>,
    };
    buckets.set(key, created);
    return created;
  };

  for (const section of workbook.sections.filter((entry) => entry.sheet === sheet)) {
    for (const row of section.rows) {
      if (row.rateMode === "REFERENCE") {
        continue;
      }
      if (row.quantity <= 0 && row.total <= 0 && !row.notes) {
        continue;
      }
      const {
        bucketKey,
        bucketTitle,
        bucketSortOrder,
        rowSortOrder,
      } = parseDisplayBucketMeta(row);
      const bucket = upsertBucket(bucketKey, bucketTitle, bucketSortOrder);
      bucket.rows.push({
        key: `${section.key}:${row.code}`,
        label: row.label,
        unit: row.unit,
        quantity: row.quantity,
        rate: buildRowUnitRate(row, workbook),
        total: row.total,
        isEditable: row.isEditable,
        sortOrder: rowSortOrder,
        ...(row.notes ? { notes: row.notes } : {}),
      });
    }
  }

  if (sheet === "LABOUR") {
    const commercialRows = buildCommercialLabourRows(workbook);
    if (commercialRows.length > 0) {
      const bucket = upsertBucket("commercial", "Commercial additions", 9000);
      bucket.rows.push(
        ...commercialRows.map((row, index) => ({
          ...row,
          sortOrder: index,
        })),
      );
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      key: bucket.key,
      title: bucket.title,
      subtotal: roundMoney(bucket.rows.reduce((sum, row) => sum + row.total, 0)),
      rows: [...bucket.rows]
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }
          return sortRowsByLabel(left, right);
        })
        .map((row) => ({
          key: row.key,
          label: row.label,
          unit: row.unit,
          quantity: row.quantity,
          rate: row.rate,
          total: row.total,
          isEditable: row.isEditable,
          ...(row.notes ? { notes: row.notes } : {}),
        })),
    }))
    .sort((left, right) => {
      const leftOrder = buckets.get(left.key)?.sortOrder ?? 9999;
      const rightOrder = buckets.get(right.key)?.sortOrder ?? 9999;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.title.localeCompare(right.title, "en-GB", { numeric: true });
    });
}

export function formatQuantityForDisplay(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function buildWorkbookRateLabel(rate: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(rate);
}

export function isTruthyRate(value: number | null): value is number {
  return value !== null;
}

export function buildManualEntryOptions(workbook: EstimateWorkbook): Array<{ code: string; label: string }> {
  return workbook.sections
    .flatMap((section) => section.rows)
    .filter((row) => row.isEditable)
    .map((row) => ({ code: row.code, label: row.label }));
}
