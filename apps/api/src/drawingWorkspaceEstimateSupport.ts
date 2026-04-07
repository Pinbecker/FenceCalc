import type {
  DrawingWorkspaceCommercialInputs,
  EstimateWorkbookManualEntry,
} from "@fence-estimator/contracts";
import {
  COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
  COMMERCIAL_LABOUR_DAY_VALUE_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
} from "@fence-estimator/contracts";

function upsert(
  entries: EstimateWorkbookManualEntry[],
  code: string,
  quantity: number | undefined,
): EstimateWorkbookManualEntry[] {
  if (quantity === undefined) {
    return entries;
  }
  const existing = entries.find((entry) => entry.code === code);
  if (existing) {
    return entries.map((entry) => (entry.code === code ? { ...entry, quantity } : entry));
  }
  return [...entries, { code, quantity }];
}

const COMMERCIAL_CODES = [
  COMMERCIAL_LABOUR_DAY_VALUE_CODE,
  COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
  COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
] as const;

export function buildDrawingWorkspaceCommercialManualEntries(
  inputs: DrawingWorkspaceCommercialInputs,
): EstimateWorkbookManualEntry[] {
  let entries: EstimateWorkbookManualEntry[] = [];
  entries = upsert(entries, COMMERCIAL_LABOUR_DAY_VALUE_CODE, inputs.labourDayValue);
  entries = upsert(entries, COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE, inputs.travelLodgePerDay);
  entries = upsert(entries, COMMERCIAL_MARKUP_RATE_CODE, inputs.markupRate);
  entries = upsert(entries, COMMERCIAL_DISTRIBUTION_CHARGE_CODE, inputs.distributionCharge);
  entries = upsert(entries, COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE, inputs.concretePricePerCube);
  entries = upsert(entries, COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE, inputs.hardDigRatePerHole);
  entries = upsert(
    entries,
    COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
    inputs.clearSpoilsRatePerHole,
  );
  return entries;
}

export function mergeDrawingWorkspaceCommercialManualEntries(
  inputs: DrawingWorkspaceCommercialInputs,
  manualEntries: EstimateWorkbookManualEntry[] = [],
): EstimateWorkbookManualEntry[] {
  const nonCommercialEntries = manualEntries.filter(
    (entry) => !COMMERCIAL_CODES.includes(entry.code as (typeof COMMERCIAL_CODES)[number]),
  );
  return [...nonCommercialEntries, ...buildDrawingWorkspaceCommercialManualEntries(inputs)];
}

export const buildJobCommercialManualEntries = buildDrawingWorkspaceCommercialManualEntries;
export const mergeJobCommercialManualEntries = mergeDrawingWorkspaceCommercialManualEntries;
