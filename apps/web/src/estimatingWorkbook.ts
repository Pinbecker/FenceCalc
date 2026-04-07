import type {
  AncillaryEstimateItem,
  EstimateWorkbook,
  EstimateWorkbookManualEntry,
  PricedEstimateResult,
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

export {
  COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
  COMMERCIAL_LABOUR_DAY_VALUE_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function recalculateWorkbook(
  baseWorkbook: EstimateWorkbook,
  manualEntries: EstimateWorkbookManualEntry[],
): EstimateWorkbook {
  const manualEntryMap = new Map(manualEntries.map((entry) => [entry.code, entry.quantity] as const));
  const settings = {
    ...baseWorkbook.settings,
    labourDayValue: roundQuantity(
      manualEntryMap.get(COMMERCIAL_LABOUR_DAY_VALUE_CODE) ??
        baseWorkbook.settings.labourDayValue ??
        205,
    ),
    travelLodgePerDay: roundMoney(
      manualEntryMap.get(COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE) ??
        baseWorkbook.settings.travelLodgePerDay,
    ),
    markupRate: roundMoney(
      manualEntryMap.get(COMMERCIAL_MARKUP_RATE_CODE) ?? baseWorkbook.settings.markupRate,
    ),
    distributionCharge: roundMoney(
      manualEntryMap.get(COMMERCIAL_DISTRIBUTION_CHARGE_CODE) ??
        baseWorkbook.settings.distributionCharge,
    ),
    concretePricePerCube: roundMoney(
      manualEntryMap.get(COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE) ??
        baseWorkbook.settings.concretePricePerCube,
    ),
    hardDigRatePerHole: roundMoney(
      manualEntryMap.get(COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE) ??
        baseWorkbook.settings.hardDigRatePerHole ??
        0,
    ),
    clearSpoilsRatePerHole: roundMoney(
      manualEntryMap.get(COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE) ??
        baseWorkbook.settings.clearSpoilsRatePerHole ??
        0,
    ),
  };

  const sections = baseWorkbook.sections.map((section) => {
    const rows = section.rows.map((row) => {
      const quantity = row.isEditable
        ? roundQuantity(manualEntryMap.get(row.code) ?? row.quantity)
        : row.quantity;
      const baseTotal =
        row.rateMode === "REFERENCE"
          ? 0
          : row.rateMode === "VOLUME_PER_UNIT"
            ? quantity * row.rate * settings.concretePricePerCube
            : quantity * row.rate;
      const concreteTotal =
        section.sheet === "MATERIALS"
          ? (row.concreteQuantity ?? 0) * settings.concretePricePerCube
          : 0;

      return {
        ...row,
        quantity,
        total: roundMoney(baseTotal + concreteTotal),
      };
    });

    return {
      ...section,
      rows,
      subtotal: roundMoney(rows.reduce((sum, row) => sum + row.total, 0)),
    };
  });

  const materialsSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "MATERIALS").reduce((sum, section) => sum + section.subtotal, 0),
  );
  const labourSubtotal = roundMoney(
    sections.filter((section) => section.sheet === "LABOUR").reduce((sum, section) => sum + section.subtotal, 0),
  );
  const holeCount = roundQuantity(
    sections.flatMap((section) => section.rows).reduce((sum, row) => sum + (row.holeQuantity ?? 0), 0),
  );
  const distributionCharge = materialsSubtotal > 0 || labourSubtotal > 0 ? settings.distributionCharge : 0;
  const hardDigTotal = roundMoney(holeCount * (settings.hardDigRatePerHole ?? 0));
  const clearSpoilsTotal = roundMoney(holeCount * (settings.clearSpoilsRatePerHole ?? 0));
  const labourBaseForDays = roundMoney(labourSubtotal + distributionCharge + hardDigTotal + clearSpoilsTotal);
  const labourDays =
    labourBaseForDays > 0 ? Math.ceil(labourBaseForDays / Math.max(settings.labourDayValue ?? 205, 1)) : 0;
  const travelTotal = roundMoney(labourDays * settings.travelLodgePerDay);
  const markupTotal = roundMoney(labourDays * settings.markupRate);

  return {
    ...baseWorkbook,
    settings,
    sections,
    manualEntries,
    commercialInputs: {
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
    },
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
      grandTotal: roundMoney(materialsSubtotal + labourBaseForDays + travelTotal + markupTotal),
    },
  };
}

export function mergeEstimateWorkbook(
  baseEstimate: PricedEstimateResult,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[],
): PricedEstimateResult {
  const ancillaryMaterialCost = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0),
  );
  const ancillaryLabourCost = roundMoney(
    ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0),
  );

  if (!baseEstimate.workbook) {
    return {
      ...baseEstimate,
      ancillaryItems,
      manualEntries,
      totals: {
        materialCost: roundMoney(baseEstimate.totals.materialCost + ancillaryMaterialCost),
        labourCost: roundMoney(baseEstimate.totals.labourCost + ancillaryLabourCost),
        totalCost: roundMoney(
          baseEstimate.totals.totalCost + ancillaryMaterialCost + ancillaryLabourCost,
        ),
      },
    };
  }

  const workbook = recalculateWorkbook(baseEstimate.workbook, manualEntries);

  return {
    ...baseEstimate,
    ancillaryItems,
    manualEntries,
    workbook,
    totals: {
      materialCost: roundMoney(workbook.totals.materialsSubtotal + ancillaryMaterialCost),
      labourCost: roundMoney(
        workbook.totals.labourSubtotal +
          workbook.totals.distributionCharge +
          (workbook.totals.hardDigTotal ?? 0) +
          (workbook.totals.clearSpoilsTotal ?? 0) +
          workbook.totals.travelTotal +
          workbook.totals.markupTotal +
          ancillaryLabourCost,
      ),
      totalCost: roundMoney(workbook.totals.grandTotal + ancillaryMaterialCost + ancillaryLabourCost),
    },
  };
}
