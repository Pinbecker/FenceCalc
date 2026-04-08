import { describe, expect, it } from "vitest";

import type { DrawingWorkspaceCommercialInputs } from "@fence-estimator/contracts";

import { serializeCommercialInputs } from "./shared";

describe("drawing workspace estimate shared helpers", () => {
  it("serializes commercial inputs canonically so property order does not trigger autosave", () => {
    const first: DrawingWorkspaceCommercialInputs = {
      labourOverheadPercent: 0,
      labourDayValue: 205,
      travelLodgePerDay: 90,
      travelDays: 1,
      markupRate: 225,
      markupUnits: 1,
      distributionCharge: 215,
      concretePricePerCube: 150,
      hardDig: false,
      clearSpoils: false,
      hardDigRatePerHole: 0,
      clearSpoilsRatePerHole: 0,
      externalCornersEnabled: true,
    };

    const second: DrawingWorkspaceCommercialInputs = {
      clearSpoilsRatePerHole: 0,
      hardDigRatePerHole: 0,
      clearSpoils: false,
      hardDig: false,
      concretePricePerCube: 150,
      distributionCharge: 215,
      markupUnits: 1,
      markupRate: 225,
      travelDays: 1,
      travelLodgePerDay: 90,
      labourDayValue: 205,
      labourOverheadPercent: 0,
      externalCornersEnabled: true,
    };

    expect(serializeCommercialInputs(first)).toBe(serializeCommercialInputs(second));
  });
});
