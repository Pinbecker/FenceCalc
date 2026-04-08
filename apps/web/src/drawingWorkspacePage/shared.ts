import type {
  AncillaryEstimateItem,
  DrawingSummary,
  DrawingTaskRecord,
  DrawingWorkspaceCommercialInputs,
  EstimateWorkbookManualEntry,
  PricedEstimateResult,
  TaskPriority,
} from "@fence-estimator/contracts";

export const DRAWING_STATUS_LABELS: Record<DrawingSummary["status"], string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

export const EMPTY_LAYOUT = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
};

export interface TaskDraftState {
  title: string;
  description: string;
  priority: TaskPriority;
  assignedUserId: string | null;
  rootDrawingId: string | null;
  revisionDrawingId: string | null;
  dueDate: string;
}

export function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value ?? 0);
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatDateOnly(value: string | null): string {
  if (!value) {
    return "No date";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

export function buildTaskDraft(task: DrawingTaskRecord): TaskDraftState {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedUserId: task.assignedUserId,
    rootDrawingId: task.rootDrawingId,
    revisionDrawingId: task.revisionDrawingId,
    dueDate: task.dueAtIso ? task.dueAtIso.slice(0, 10) : "",
  };
}

export function buildAncillaryItem(): AncillaryEstimateItem {
  return {
    id: `ancillary-${crypto.randomUUID()}`,
    description: "",
    quantity: 1,
    materialCost: 0,
    labourCost: 0,
  };
}

export function upsertManualEntry(
  current: EstimateWorkbookManualEntry[],
  code: string,
  quantity: number,
): EstimateWorkbookManualEntry[] {
  const existing = current.find((entry) => entry.code === code);
  const nextQuantity = Number.isFinite(quantity) ? quantity : 0;
  if (existing) {
    return current.map((entry) =>
      entry.code === code ? { ...entry, quantity: nextQuantity } : entry,
    );
  }
  return [...current, { code, quantity: nextQuantity }];
}

export function buildInitialManualEntries(
  pricedEstimate: PricedEstimateResult,
): EstimateWorkbookManualEntry[] {
  return [...(pricedEstimate.manualEntries ?? [])];
}

export function buildCommercialInputs(
  pricedEstimate: PricedEstimateResult | null,
  currentInputs: DrawingWorkspaceCommercialInputs | null = null,
): DrawingWorkspaceCommercialInputs | null {
  const workbook = pricedEstimate?.workbook;
  if (!workbook) {
    return null;
  }

  return {
    labourOverheadPercent: workbook.settings.labourOverheadPercent,
    labourDayValue: workbook.settings.labourDayValue,
    travelLodgePerDay: workbook.settings.travelLodgePerDay,
    travelDays: workbook.commercialInputs.travelDays,
    markupRate: workbook.settings.markupRate,
    markupUnits: workbook.commercialInputs.markupUnits,
    distributionCharge: workbook.settings.distributionCharge,
    concretePricePerCube: workbook.settings.concretePricePerCube,
    hardDigRatePerHole: workbook.settings.hardDigRatePerHole,
    clearSpoilsRatePerHole: workbook.settings.clearSpoilsRatePerHole,
    hardDig: (workbook.settings.hardDigRatePerHole ?? 0) > 0,
    clearSpoils: (workbook.settings.clearSpoilsRatePerHole ?? 0) > 0,
    externalCornersEnabled: currentInputs?.externalCornersEnabled ?? true,
  };
}

export function serializeCommercialInputs(
  inputs: DrawingWorkspaceCommercialInputs | null,
): string | null {
  if (!inputs) {
    return null;
  }

  return JSON.stringify({
    labourOverheadPercent: inputs.labourOverheadPercent,
    labourDayValue: inputs.labourDayValue,
    travelLodgePerDay: inputs.travelLodgePerDay,
    travelDays: inputs.travelDays,
    markupRate: inputs.markupRate,
    markupUnits: inputs.markupUnits,
    distributionCharge: inputs.distributionCharge,
    concretePricePerCube: inputs.concretePricePerCube,
    hardDig: inputs.hardDig,
    clearSpoils: inputs.clearSpoils,
    hardDigRatePerHole: inputs.hardDigRatePerHole,
    clearSpoilsRatePerHole: inputs.clearSpoilsRatePerHole,
    externalCornersEnabled: inputs.externalCornersEnabled ?? true,
  });
}
