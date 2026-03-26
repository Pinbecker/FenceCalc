import type {
  DrawingRecord,
  EstimateWorkbook,
  EstimateWorkbookRow,
  InstallLiftLevel,
  PricingWorkbookConfig,
  PricingWorkbookRow
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

interface SectionBucket {
  key: string;
  title: string;
  sortOrder: number;
  rows: EstimateDisplayRow[];
}

const HEIGHT_SORT_ORDER = [1000, 1200, 1400, 2000, 2400, 3000, 3600, 4000, 4500, 5000, 6000, 8000, 10000];
const EXTRA_SECTION_SORT_ORDER: Record<string, number> = {
  "Top rails": 7000,
  Concrete: 7100,
  Features: 7200,
  "Plant and delivery": 7300,
  "Site works": 7400
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toHeightKey(heightMm: number): string {
  const metres = heightMm / 1000;
  return Number.isInteger(metres) ? `${metres}` : metres.toFixed(1).replace(/\.0$/, "");
}

export function formatHeightMm(heightMm: number): string {
  return `${(heightMm / 1000).toFixed(2)}m`;
}

function formatLift(lift: InstallLiftLevel): string {
  if (lift === "GROUND") {
    return "Ground";
  }
  if (lift === "FIRST") {
    return "1st lift";
  }
  return "2nd lift";
}

function getMaterialRows(workbook: PricingWorkbookConfig): PricingWorkbookRow[] {
  return workbook.sections.filter((section) => section.sheet === "MATERIALS").flatMap((section) => section.rows);
}

function getLabourRows(workbook: PricingWorkbookConfig): PricingWorkbookRow[] {
  return workbook.sections.filter((section) => section.sheet === "LABOUR").flatMap((section) => section.rows);
}

function getPanelVariant(row: PricingWorkbookRow): "STANDARD" | "SUPER_REBOUND" | null {
  if (row.quantityRule.kind !== "PANEL_LAYER_COUNT") {
    return null;
  }
  return row.quantityRule.variant === "TOTAL" ? null : row.quantityRule.variant;
}

function getPanelHeightMm(row: PricingWorkbookRow): number | null {
  return row.quantityRule.kind === "PANEL_LAYER_COUNT" ? row.quantityRule.panelHeightMm : null;
}

function getPanelLift(row: PricingWorkbookRow): InstallLiftLevel | null {
  return row.quantityRule.kind === "PANEL_LAYER_COUNT" ? row.quantityRule.lift ?? null : null;
}

function isReferenceRow(row: PricingWorkbookRow): boolean {
  return row.rateMode === "REFERENCE";
}

function buildPanelPricingRows(
  workbook: PricingWorkbookConfig,
  variant: "STANDARD" | "SUPER_REBOUND"
): PricingRateEditorRow[] {
  const materialRows = getMaterialRows(workbook)
    .filter((row) => getPanelVariant(row) === variant)
    .sort((left, right) => (getPanelHeightMm(left) ?? 0) - (getPanelHeightMm(right) ?? 0));
  const labourRows = getLabourRows(workbook).filter((row) => getPanelVariant(row) === variant);

  return materialRows.reduce<PricingRateEditorRow[]>((rows, materialRow) => {
    const panelHeightMm = getPanelHeightMm(materialRow) ?? 0;
    const matchingLabourRows = labourRows
      .filter((labourRow) => getPanelHeightMm(labourRow) === panelHeightMm)
      .sort((left, right) => {
        const liftOrder = { GROUND: 0, FIRST: 1, SECOND: 2 } as const;
        return liftOrder[getPanelLift(left) ?? "GROUND"] - liftOrder[getPanelLift(right) ?? "GROUND"];
      });

    if (matchingLabourRows.length === 0) {
      rows.push({
        key: materialRow.code,
        label: `${formatHeightMm(panelHeightMm)} ${variant === "STANDARD" ? "standard 868 panels" : "rebound 868 panels"}`,
        unit: materialRow.unit,
        materialRate: materialRow.rate,
        labourRate: null,
        materialCode: materialRow.code,
        ...(materialRow.notes ? { notes: materialRow.notes } : {})
      });
      return rows;
    }

    matchingLabourRows.forEach((labourRow) => {
      rows.push({
        key: `${materialRow.code}:${labourRow.code}`,
        label: `${formatHeightMm(panelHeightMm)} ${variant === "STANDARD" ? "standard 868 panels" : "rebound 868 panels"} | ${formatLift(
          getPanelLift(labourRow) ?? "GROUND"
        )}`,
        unit: materialRow.unit,
        materialRate: materialRow.rate,
        labourRate: labourRow.rate,
        materialCode: materialRow.code,
        labourCode: labourRow.code,
        ...(materialRow.notes ?? labourRow.notes ? { notes: materialRow.notes ?? labourRow.notes } : {})
      });
    });
    return rows;
  }, []);
}

function getHeightMmFromMaterialRow(row: PricingWorkbookRow): number | null {
  if (row.quantityRule.kind === "POST_COUNT" || row.quantityRule.kind === "CORNER_COUNT" || row.quantityRule.kind === "TOTAL_POSTS_BY_HEIGHT") {
    return row.quantityRule.heightMm;
  }
  if (row.quantityRule.kind === "GATE_COUNT") {
    return Math.round(Number.parseFloat(row.quantityRule.heightKey) * 1000);
  }
  if (row.quantityRule.kind === "TOP_RAIL_COUNT") {
    return Math.round(Number.parseFloat(row.quantityRule.heightKey) * 1000);
  }
  return null;
}

function findLabourRateByHeight(workbook: PricingWorkbookConfig, heightMm: number, suffix: "INTERS_ENDS" | "CORNERS" | "TOP_RAILS"): PricingWorkbookRow | null {
  return (
    getLabourRows(workbook).find((row) => row.code === `LAB_${heightMm}_${suffix}`) ??
    null
  );
}

function buildPostPricingRows(
  workbook: PricingWorkbookConfig,
  predicate: (row: PricingWorkbookRow) => boolean,
  labourSuffix: "INTERS_ENDS" | "CORNERS" | "TOP_RAILS" | null
): PricingRateEditorRow[] {
  return getMaterialRows(workbook)
    .filter((row) => !isReferenceRow(row))
    .filter(predicate)
    .sort((left, right) => (getHeightMmFromMaterialRow(left) ?? 0) - (getHeightMmFromMaterialRow(right) ?? 0))
    .map((row) => {
      const heightMm = getHeightMmFromMaterialRow(row);
      const labourRow = heightMm && labourSuffix ? findLabourRateByHeight(workbook, heightMm, labourSuffix) : null;
      return {
        key: row.code,
        label: row.label,
        unit: row.unit,
        materialRate: row.rateMode === "VOLUME_PER_UNIT" ? null : row.rate,
        labourRate: labourRow?.rate ?? null,
        materialCode: row.code,
        ...(labourRow ? { labourCode: labourRow.code } : {}),
        ...(row.notes ? { notes: row.notes } : {})
      };
    });
}

function getGateBucketLabourRate(workbook: PricingWorkbookConfig, heightMm: number, gateType: "SINGLE_LEAF" | "DOUBLE_LEAF"): PricingWorkbookRow | null {
  const bucket = heightMm >= 4500 ? "LARGE" : "SMALL";
  const suffix = gateType === "SINGLE_LEAF" ? "SINGLE" : "DOUBLE";
  return getLabourRows(workbook).find((row) => row.code === `LAB_GATES_${bucket}_${suffix}`) ?? null;
}

function buildGatePricingRows(workbook: PricingWorkbookConfig, gateType: "SINGLE_LEAF" | "DOUBLE_LEAF"): PricingRateEditorRow[] {
  return getMaterialRows(workbook)
    .filter((row) => row.quantityRule.kind === "GATE_COUNT" && row.quantityRule.output === "gate" && row.quantityRule.gateType === gateType)
    .sort((left, right) => (getHeightMmFromMaterialRow(left) ?? 0) - (getHeightMmFromMaterialRow(right) ?? 0))
    .map((row) => {
      const heightMm = getHeightMmFromMaterialRow(row) ?? 0;
      const labourRow = getGateBucketLabourRate(workbook, heightMm, gateType);
      return {
        key: row.code,
        label: row.label,
        unit: row.unit,
        materialRate: row.rate,
        labourRate: labourRow?.rate ?? null,
        materialCode: row.code,
        ...(labourRow ? { labourCode: labourRow.code } : {})
      };
    });
}

function buildFeaturePricingRows(workbook: PricingWorkbookConfig): PricingRateEditorRow[] {
  const labourRows = getLabourRows(workbook);
  const featurePairs: Array<[string, string]> = [
    ["MAT_FEATURE_KICKBOARD_BOARDS", "LAB_KICKBOARDS"],
    ["MAT_FEATURE_LINTEL_PANELS", "LAB_LINTEL_RECESS"],
    ["MAT_FEATURE_GOAL_UNITS", "LAB_GOAL_UNITS"],
    ["MAT_FEATURE_BASKETBALL_DEDICATED", "LAB_BASKETBALL_POSTS"],
    ["MAT_FEATURE_FLOODLIGHT_COLUMNS", "LAB_FLOODLIGHT_COLUMNS"],
    ["MAT_FEATURE_PITCH_DIVIDER_ANCHORS", "LAB_PITCH_DIVIDER_POSTS"],
    ["MAT_FEATURE_PITCH_DIVIDER_SUPPORTS", "LAB_PITCH_DIVIDER_POSTS"],
    ["MAT_FEATURE_PITCH_DIVIDER_NETTING", "LAB_PITCH_DIVIDER_NETTING"]
  ];
  const labourMap = new Map<string, PricingWorkbookRow>(
    featurePairs.flatMap(([materialCode, labourCode]) => {
      const labourRow = labourRows.find((row) => row.code === labourCode);
      return labourRow ? [[materialCode, labourRow] as const] : [];
    })
  );

  return getMaterialRows(workbook)
    .filter((row) => row.code.startsWith("MAT_FEATURE_"))
    .filter((row) => !isReferenceRow(row))
    .map((row) => {
      const labourRow = labourMap.get(row.code) ?? null;
      return {
        key: row.code,
        label: row.label,
        unit: row.unit,
        materialRate: row.rate,
        labourRate: labourRow?.rate ?? null,
        materialCode: row.code,
        ...(labourRow ? { labourCode: labourRow.code } : {})
      };
    });
}

function buildSiteWorksPricingRows(workbook: PricingWorkbookConfig): PricingRateEditorRow[] {
  const materialRows = getMaterialRows(workbook).filter((row) => row.code.startsWith("MAT_PLANT_") || row.code.startsWith("MAT_SKIP_") || row.code.startsWith("MAT_LIFTING") || row.code.startsWith("MAT_MISC_"));
  const labourRows = getLabourRows(workbook).filter((row) =>
    row.code === "LAB_BACK_EDGING" ||
    row.code === "LAB_HARD_DIG" ||
    row.code === "LAB_CLEAR_SPOILS" ||
    row.code.startsWith("LAB_FREETYPE_")
  );

  return [
    ...materialRows.map((row) => ({
      key: row.code,
      label: row.label,
      unit: row.unit,
      materialRate: row.rate,
      labourRate: null,
      materialCode: row.code
    })),
    ...labourRows.map((row) => ({
      key: row.code,
      label: row.label,
      unit: row.unit,
      materialRate: null,
      labourRate: row.rate,
      labourCode: row.code
    }))
  ];
}

export function buildPricingRateGroups(workbook: PricingWorkbookConfig): PricingRateGroup[] {
  const groups: PricingRateGroup[] = [
    {
      key: "panels-standard",
      title: "Standard 868 panels",
      rows: buildPanelPricingRows(workbook, "STANDARD")
    },
    {
      key: "panels-rebound",
      title: "Rebound 868 panels",
      rows: buildPanelPricingRows(workbook, "SUPER_REBOUND")
    },
    {
      key: "corners",
      title: "Corner posts",
      rows: buildPostPricingRows(
        workbook,
        (row) => row.quantityRule.kind === "CORNER_COUNT" || row.code.includes("_CORNERS_"),
        "CORNERS"
      )
    },
    {
      key: "end-posts",
      title: "End posts",
      rows: buildPostPricingRows(
        workbook,
        (row) => row.code.includes("_ENDS_") && !row.code.includes("_INTERS_ENDS"),
        "INTERS_ENDS"
      )
    },
    {
      key: "intermediate-posts",
      title: "Intermediate posts",
      rows: buildPostPricingRows(
        workbook,
        (row) => row.code.includes("_INTERS_") && !row.code.includes("_INTERS_ENDS") && !row.code.includes("STEPPED"),
        "INTERS_ENDS"
      )
    },
    {
      key: "inter-end-posts",
      title: "Inter / end posts",
      rows: buildPostPricingRows(workbook, (row) => row.code.includes("_INTERS_ENDS"), "INTERS_ENDS")
    },
    {
      key: "top-rails",
      title: "Top rails",
      rows: buildPostPricingRows(workbook, (row) => row.quantityRule.kind === "TOP_RAIL_COUNT", "TOP_RAILS")
    },
    {
      key: "single-leaf-gates",
      title: "Single leaf gates",
      rows: buildGatePricingRows(workbook, "SINGLE_LEAF")
    },
    {
      key: "double-leaf-gates",
      title: "Double leaf gates",
      rows: buildGatePricingRows(workbook, "DOUBLE_LEAF")
    },
    {
      key: "concrete",
      title: "Concrete",
      rows: [
        {
          key: "concrete-price-per-cube",
          label: "Concrete price per cube",
          unit: "m3",
          materialRate: workbook.settings.concretePricePerCube,
          labourRate: null,
          materialSettingKey: "concretePricePerCube"
        }
      ]
    },
    {
      key: "features",
      title: "Features and ancillaries",
      rows: buildFeaturePricingRows(workbook)
    },
    {
      key: "site-works",
      title: "Site works and extras",
      rows: buildSiteWorksPricingRows(workbook)
    }
  ];

  return groups.filter((group) => group.rows.length > 0);
}

function parseHeightMmFromCode(code: string): number | null {
  const matches = [
    /^MAT_(\d{4})_/,
    /^LAB_(\d{4})_/,
    /^MAT_PANEL_(\d{4})_/,
    /^LAB_PANEL_(\d{4})_/,
    /^MAT_CONCRETE_(\d{4})$/
  ];
  for (const pattern of matches) {
    const match = code.match(pattern);
    if (match) {
      return Number.parseInt(match[1] ?? "0", 10);
    }
  }
  return null;
}

function getGateCountsByHeight(drawing: DrawingRecord): Map<string, { SINGLE_LEAF: number; DOUBLE_LEAF: number }> {
  const segmentHeightById = new Map(drawing.layout.segments.map((segment) => [segment.id, segment.spec.height] as const));
  const counts = new Map<string, { SINGLE_LEAF: number; DOUBLE_LEAF: number }>();

  for (const gate of drawing.layout.gates ?? []) {
    if (gate.gateType === "CUSTOM") {
      continue;
    }
    const heightKey = segmentHeightById.get(gate.segmentId);
    if (!heightKey) {
      continue;
    }
    const existing = counts.get(heightKey) ?? { SINGLE_LEAF: 0, DOUBLE_LEAF: 0 };
    existing[gate.gateType] += 1;
    counts.set(heightKey, existing);
  }

  return counts;
}

function getGateLabourRateForHeight(workbook: EstimateWorkbook, heightMm: number, gateType: "SINGLE_LEAF" | "DOUBLE_LEAF"): number {
  const bucket = heightMm >= 4500 ? "LARGE" : "SMALL";
  const suffix = gateType === "SINGLE_LEAF" ? "SINGLE" : "DOUBLE";
  for (const section of workbook.sections) {
    const match = section.rows.find((row) => row.code === `LAB_GATES_${bucket}_${suffix}`);
    if (match) {
      return match.rate;
    }
  }
  return 0;
}

function getDisplayMoneyRate(row: EstimateWorkbookRow, workbook: EstimateWorkbook): number {
  return row.rateMode === "VOLUME_PER_UNIT" ? roundMoney(row.rate * workbook.settings.concretePricePerCube) : row.rate;
}

function shouldHideEstimateRow(row: EstimateWorkbookRow): boolean {
  if (row.rateMode === "REFERENCE") {
    return true;
  }
  if (row.code === "LAB_HARD_DIG" || row.code === "LAB_CLEAR_SPOILS") {
    return true;
  }
  return row.quantity <= 0 && row.total <= 0;
}

function buildSectionKeyAndTitle(row: EstimateWorkbookRow): { key: string; title: string; sortOrder: number } {
  const heightMm = parseHeightMmFromCode(row.code);
  if (heightMm !== null) {
    const sortIndex = HEIGHT_SORT_ORDER.indexOf(heightMm);
    return {
      key: `height-${heightMm}`,
      title: `${formatHeightMm(heightMm)} height`,
      sortOrder: sortIndex >= 0 ? sortIndex : 5000 + heightMm
    };
  }

  if (row.code.includes("TOP_RAIL")) {
    return {
      key: "top-rails",
      title: "Top rails",
      sortOrder: EXTRA_SECTION_SORT_ORDER["Top rails"] ?? 7000
    };
  }
  if (row.code.includes("CONCRETE")) {
    return {
      key: "concrete",
      title: "Concrete",
      sortOrder: EXTRA_SECTION_SORT_ORDER.Concrete ?? 7100
    };
  }
  if (row.code.includes("FEATURE") || row.code.includes("GOAL") || row.code.includes("BASKETBALL") || row.code.includes("FLOODLIGHT") || row.code.includes("PITCH_DIVIDER") || row.code.includes("SIDE_NETTING") || row.code.includes("KICKBOARD")) {
    return {
      key: "features",
      title: "Features",
      sortOrder: EXTRA_SECTION_SORT_ORDER.Features ?? 7200
    };
  }
  if (row.code.startsWith("MAT_PLANT") || row.code.startsWith("MAT_SKIP") || row.code.startsWith("MAT_LIFTING") || row.code.startsWith("MAT_MISC")) {
    return {
      key: "plant-and-delivery",
      title: "Plant and delivery",
      sortOrder: EXTRA_SECTION_SORT_ORDER["Plant and delivery"] ?? 7300
    };
  }
  return {
    key: "site-works",
    title: "Site works",
    sortOrder: EXTRA_SECTION_SORT_ORDER["Site works"] ?? 7400
  };
}

function sortEstimateRows(left: EstimateDisplayRow, right: EstimateDisplayRow): number {
  if (left.label === right.label) {
    return left.key.localeCompare(right.key);
  }
  return left.label.localeCompare(right.label, "en-GB", { numeric: true });
}

export function buildEstimateDisplaySections(
  workbook: EstimateWorkbook,
  drawing: DrawingRecord,
  sheet: "MATERIALS" | "LABOUR"
): EstimateDisplaySection[] {
  const buckets = new Map<string, SectionBucket>();

  const upsertBucket = (sectionKey: string, title: string, sortOrder: number, row: EstimateDisplayRow) => {
    const existing = buckets.get(sectionKey) ?? {
      key: sectionKey,
      title,
      sortOrder,
      rows: []
    };
    existing.rows.push(row);
    buckets.set(sectionKey, existing);
  };

  for (const section of workbook.sections.filter((entry) => entry.sheet === sheet)) {
    for (const row of section.rows) {
      if (sheet === "LABOUR" && row.code.startsWith("LAB_GATES_")) {
        continue;
      }
      if (shouldHideEstimateRow(row)) {
        continue;
      }
      const placement = buildSectionKeyAndTitle(row);
      upsertBucket(placement.key, placement.title, placement.sortOrder, {
        key: `${section.key}:${row.code}`,
        label: row.label,
        unit: row.unit,
        quantity: row.quantity,
        rate: getDisplayMoneyRate(row, workbook),
        total: row.total,
        isEditable: row.isEditable,
        ...(row.notes ? { notes: row.notes } : {})
      });
    }
  }

  if (sheet === "LABOUR") {
    const gateCounts = getGateCountsByHeight(drawing);
    for (const [heightKey, counts] of gateCounts) {
      const heightMm = Math.round(Number.parseFloat(heightKey) * 1000);
      for (const gateType of ["SINGLE_LEAF", "DOUBLE_LEAF"] as const) {
        const quantity = counts[gateType];
        if (quantity <= 0) {
          continue;
        }
        const rate = getGateLabourRateForHeight(workbook, heightMm, gateType);
        const sortIndex = HEIGHT_SORT_ORDER.indexOf(heightMm);
        const placement = {
          key: `height-${heightMm}`,
          title: `${formatHeightMm(heightMm)} height`,
          sortOrder: sortIndex >= 0 ? sortIndex : 5000 + heightMm
        };
        upsertBucket(placement.key, placement.title, placement.sortOrder, {
          key: `synthetic-gate-${heightKey}-${gateType}`,
          label: `${gateType === "SINGLE_LEAF" ? "Single leaf gate" : "Double leaf gate"} installation`,
          unit: "gate",
          quantity,
          rate,
          total: roundMoney(quantity * rate),
          isEditable: false
        });
      }
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      key: bucket.key,
      title: bucket.title,
      subtotal: roundMoney(bucket.rows.reduce((sum, row) => sum + row.total, 0)),
      rows: [...bucket.rows].sort(sortEstimateRows)
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .sort((left, right) => {
      const leftBucket = buckets.get(left.key);
      const rightBucket = buckets.get(right.key);
      return (leftBucket?.sortOrder ?? 9999) - (rightBucket?.sortOrder ?? 9999);
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
    currency: "GBP"
  }).format(rate);
}

export function isTruthyRate(value: number | null): value is number {
  return value !== null;
}

export function buildManualEntryOptions(workbook: EstimateWorkbook): Array<{ code: string; label: string }> {
  return workbook.sections
    .flatMap((section) => section.rows)
    .filter((row) => row.isEditable)
    .filter((row) => row.code !== "LAB_HARD_DIG" && row.code !== "LAB_CLEAR_SPOILS")
    .map((row) => ({ code: row.code, label: row.label }));
}

export function buildGateHeightOptions(drawing: DrawingRecord): Array<{ heightMm: number; heightKey: string }> {
  return [...new Set(drawing.layout.segments.map((segment) => Math.round(Number.parseFloat(segment.spec.height) * 1000)))]
    .sort((left, right) => left - right)
    .map((heightMm) => ({ heightMm, heightKey: toHeightKey(heightMm) }));
}
