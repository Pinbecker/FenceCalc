import type {
  AncillaryEstimateItem,
  EstimateWorkbook,
  EstimateWorkbookManualEntry,
  PricedEstimateResult
} from "@fence-estimator/contracts";

export const COMMERCIAL_TRAVEL_DAYS_CODE = "COMMERCIAL_TRAVEL_DAYS";
export const COMMERCIAL_MARKUP_UNITS_CODE = "COMMERCIAL_MARKUP_UNITS";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function recalculateWorkbook(baseWorkbook: EstimateWorkbook, manualEntries: EstimateWorkbookManualEntry[]): EstimateWorkbook {
  const manualEntryMap = new Map(manualEntries.map((entry) => [entry.code, entry.quantity] as const));
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
            ? roundMoney(quantity * row.rate * baseWorkbook.settings.concretePricePerCube)
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
  const labourOverheadAmount = roundMoney(labourSubtotal * (baseWorkbook.settings.labourOverheadPercent / 100));
  const travelTotal = roundMoney(travelDays * baseWorkbook.settings.travelLodgePerDay);
  const markupTotal = roundMoney(markupUnits * baseWorkbook.settings.markupRate);

  return {
    ...baseWorkbook,
    sections,
    manualEntries,
    commercialInputs: {
      travelDays,
      markupUnits
    },
    totals: {
      materialsSubtotal,
      labourSubtotal,
      labourOverheadPercent: baseWorkbook.settings.labourOverheadPercent,
      labourOverheadAmount,
      distributionCharge: baseWorkbook.totals.distributionCharge,
      travelDays,
      travelRatePerDay: baseWorkbook.settings.travelLodgePerDay,
      travelTotal,
      markupUnits,
      markupRate: baseWorkbook.settings.markupRate,
      markupTotal,
      grandTotal: roundMoney(
        materialsSubtotal + baseWorkbook.totals.distributionCharge + labourSubtotal + labourOverheadAmount + travelTotal + markupTotal
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
