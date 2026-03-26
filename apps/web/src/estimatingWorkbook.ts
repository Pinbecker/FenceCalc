import type {
  AncillaryEstimateItem,
  EstimateWorkbook,
  EstimateWorkbookManualEntry,
  PricedEstimateResult
} from "@fence-estimator/contracts";

export const COMMERCIAL_TRAVEL_DAYS_CODE = "COMMERCIAL_TRAVEL_DAYS";
export const COMMERCIAL_MARKUP_UNITS_CODE = "COMMERCIAL_MARKUP_UNITS";
export const COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE = "COMMERCIAL_LABOUR_OVERHEAD_PERCENT";
export const COMMERCIAL_TRAVEL_RATE_CODE = "COMMERCIAL_TRAVEL_RATE";
export const COMMERCIAL_MARKUP_RATE_CODE = "COMMERCIAL_MARKUP_RATE";
export const COMMERCIAL_DISTRIBUTION_CHARGE_CODE = "COMMERCIAL_DISTRIBUTION_CHARGE";
export const COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE = "COMMERCIAL_CONCRETE_PRICE_PER_CUBE";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function recalculateWorkbook(baseWorkbook: EstimateWorkbook, manualEntries: EstimateWorkbookManualEntry[]): EstimateWorkbook {
  const manualEntryMap = new Map(manualEntries.map((entry) => [entry.code, entry.quantity] as const));
  const settings = {
    ...baseWorkbook.settings,
    labourOverheadPercent: roundQuantity(
      manualEntryMap.get(COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE) ?? baseWorkbook.settings.labourOverheadPercent
    ),
    travelLodgePerDay: roundMoney(
      manualEntryMap.get(COMMERCIAL_TRAVEL_RATE_CODE) ?? baseWorkbook.settings.travelLodgePerDay
    ),
    markupRate: roundMoney(manualEntryMap.get(COMMERCIAL_MARKUP_RATE_CODE) ?? baseWorkbook.settings.markupRate),
    distributionCharge: roundMoney(
      manualEntryMap.get(COMMERCIAL_DISTRIBUTION_CHARGE_CODE) ?? baseWorkbook.settings.distributionCharge
    ),
    concretePricePerCube: roundMoney(
      manualEntryMap.get(COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE) ?? baseWorkbook.settings.concretePricePerCube
    )
  };
  const sections = baseWorkbook.sections.map((section) => {
    const rows = section.rows.map((row) => {
      if (!row.isEditable) {
        return row;
      }
      const quantity = roundQuantity(manualEntryMap.get(row.code) ?? 0);
      const total =
        row.rateMode === "REFERENCE"
          ? 0
          : row.rateMode === "VOLUME_PER_UNIT"
            ? roundMoney(quantity * row.rate * settings.concretePricePerCube)
            : roundMoney(quantity * row.rate);
      return {
        ...row,
        quantity,
        total
      };
    });

    return {
      ...section,
      rows,
      subtotal: roundMoney(rows.reduce((sum, row) => sum + row.total, 0))
    };
  });

  const materialsSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "MATERIALS").reduce((sum, section) => sum + section.subtotal, 0)
  );
  const labourSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "LABOUR").reduce((sum, section) => sum + section.subtotal, 0)
  );
  const travelDays = roundQuantity(manualEntryMap.get(COMMERCIAL_TRAVEL_DAYS_CODE) ?? 0);
  const markupUnits = roundQuantity(manualEntryMap.get(COMMERCIAL_MARKUP_UNITS_CODE) ?? 0);
  const labourOverheadAmount = roundMoney(labourSubtotal * (settings.labourOverheadPercent / 100));
  const travelTotal = roundMoney(travelDays * settings.travelLodgePerDay);
  const markupTotal = roundMoney(markupUnits * settings.markupRate);

  return {
    ...baseWorkbook,
    settings,
    sections,
    manualEntries,
    commercialInputs: {
      travelDays,
      markupUnits
    },
    totals: {
      materialsSubtotal,
      labourSubtotal,
      labourOverheadPercent: settings.labourOverheadPercent,
      labourOverheadAmount,
      distributionCharge: settings.distributionCharge,
      travelDays,
      travelRatePerDay: settings.travelLodgePerDay,
      travelTotal,
      markupUnits,
      markupRate: settings.markupRate,
      markupTotal,
      grandTotal: roundMoney(
        materialsSubtotal + settings.distributionCharge + labourSubtotal + labourOverheadAmount + travelTotal + markupTotal
      )
    }
  };
}

export function mergeEstimateWorkbook(
  baseEstimate: PricedEstimateResult,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[]
): PricedEstimateResult {
  if (!baseEstimate.workbook) {
    const ancillaryMaterialCost = roundMoney(
      ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0)
    );
    const ancillaryLabourCost = roundMoney(ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0));
    return {
      ...baseEstimate,
      ancillaryItems,
      manualEntries,
      totals: {
        materialCost: roundMoney(baseEstimate.totals.materialCost + ancillaryMaterialCost),
        labourCost: roundMoney(baseEstimate.totals.labourCost + ancillaryLabourCost),
        totalCost: roundMoney(baseEstimate.totals.totalCost + ancillaryMaterialCost + ancillaryLabourCost)
      }
    };
  }

  const workbook = recalculateWorkbook(baseEstimate.workbook, manualEntries);
  const ancillaryMaterialCost = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0)
  );
  const ancillaryLabourCost = roundMoney(ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0));

  return {
    ...baseEstimate,
    ancillaryItems,
    manualEntries,
    workbook,
    totals: {
      materialCost: roundMoney(workbook.totals.materialsSubtotal + workbook.totals.distributionCharge + ancillaryMaterialCost),
      labourCost: roundMoney(
        workbook.totals.labourSubtotal +
          workbook.totals.labourOverheadAmount +
          workbook.totals.travelTotal +
          workbook.totals.markupTotal +
          ancillaryLabourCost
      ),
      totalCost: roundMoney(
        workbook.totals.grandTotal + ancillaryMaterialCost + ancillaryLabourCost
      )
    }
  };
}
