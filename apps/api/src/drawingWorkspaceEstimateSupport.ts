import type {
  DrawingWorkspaceCommercialInputs,
  EstimateWorkbookManualEntry,
} from "@fence-estimator/contracts";

const COMMERCIAL_TRAVEL_DAYS_CODE = "COMMERCIAL_TRAVEL_DAYS";
const COMMERCIAL_MARKUP_UNITS_CODE = "COMMERCIAL_MARKUP_UNITS";
const COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE = "COMMERCIAL_LABOUR_OVERHEAD_PERCENT";
const COMMERCIAL_TRAVEL_RATE_CODE = "COMMERCIAL_TRAVEL_RATE";
const COMMERCIAL_MARKUP_RATE_CODE = "COMMERCIAL_MARKUP_RATE";
const COMMERCIAL_DISTRIBUTION_CHARGE_CODE = "COMMERCIAL_DISTRIBUTION_CHARGE";
const COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE = "COMMERCIAL_CONCRETE_PRICE_PER_CUBE";
const LAB_HARD_DIG_CODE = "LAB_HARD_DIG";
const LAB_CLEAR_SPOILS_CODE = "LAB_CLEAR_SPOILS";

function upsert(entries: EstimateWorkbookManualEntry[], code: string, quantity: number): EstimateWorkbookManualEntry[] {
  const existing = entries.find((entry) => entry.code === code);
  if (existing) {
    return entries.map((entry) => (entry.code === code ? { ...entry, quantity } : entry));
  }
  return [...entries, { code, quantity }];
}

export function buildDrawingWorkspaceCommercialManualEntries(
  inputs: DrawingWorkspaceCommercialInputs,
): EstimateWorkbookManualEntry[] {
  let entries: EstimateWorkbookManualEntry[] = [];
  entries = upsert(entries, COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE, inputs.labourOverheadPercent);
  entries = upsert(entries, COMMERCIAL_TRAVEL_RATE_CODE, inputs.travelLodgePerDay);
  entries = upsert(entries, COMMERCIAL_TRAVEL_DAYS_CODE, inputs.travelDays);
  entries = upsert(entries, COMMERCIAL_MARKUP_RATE_CODE, inputs.markupRate);
  entries = upsert(entries, COMMERCIAL_MARKUP_UNITS_CODE, inputs.markupUnits);
  entries = upsert(entries, COMMERCIAL_DISTRIBUTION_CHARGE_CODE, inputs.distributionCharge);
  entries = upsert(entries, COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE, inputs.concretePricePerCube);
  entries = upsert(entries, LAB_HARD_DIG_CODE, inputs.hardDig ? 1 : 0);
  entries = upsert(entries, LAB_CLEAR_SPOILS_CODE, inputs.clearSpoils ? 1 : 0);
  return entries;
}

export function mergeDrawingWorkspaceCommercialManualEntries(
  inputs: DrawingWorkspaceCommercialInputs,
  manualEntries: EstimateWorkbookManualEntry[] = [],
): EstimateWorkbookManualEntry[] {
  const nonCommercialEntries = manualEntries.filter((entry) =>
    ![
      COMMERCIAL_TRAVEL_DAYS_CODE,
      COMMERCIAL_MARKUP_UNITS_CODE,
      COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE,
      COMMERCIAL_TRAVEL_RATE_CODE,
      COMMERCIAL_MARKUP_RATE_CODE,
      COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
      COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
      LAB_HARD_DIG_CODE,
      LAB_CLEAR_SPOILS_CODE
    ].includes(entry.code)
  );
  return [...nonCommercialEntries, ...buildDrawingWorkspaceCommercialManualEntries(inputs)];
}

export const buildJobCommercialManualEntries = buildDrawingWorkspaceCommercialManualEntries;
export const mergeJobCommercialManualEntries = mergeDrawingWorkspaceCommercialManualEntries;
