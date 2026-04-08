import { describe, expect, it } from "vitest";

import { buildDefaultPricingWorkbookConfig } from "@fence-estimator/contracts";

import { buildEditorPricingOptions } from "./pricingEditorOptions.js";

describe("buildEditorPricingOptions", () => {
  it("derives editor-selectable variants from pricing workbook catalog quantity keys", () => {
    const workbook = buildDefaultPricingWorkbookConfig();
    workbook.sections[0]?.rows.push({
      code: "MAT_CUSTOM_FLOODLIGHT_COLUMN_7500",
      label: "Floodlight column 7.5m",
      unit: "column",
      rate: 0,
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: "floodlight:column:7500:count" },
      category: "FLOODLIGHT_COLUMNS",
      presentation: {
        pairKey: "custom:floodlight:column:7500",
        groupKey: "floodlight-columns",
        groupTitle: "Floodlight columns",
        sortOrder: 8200,
      },
    });
    workbook.sections[0]?.rows.push({
      code: "MAT_CUSTOM_KICKBOARD_300_75_BULLNOSE_3000",
      label: "300 x 75 bullnose kickboards",
      unit: "board",
      rate: 0,
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: "kickboard:300:75:BULLNOSE:3000:boards" },
      category: "KICKBOARDS",
      presentation: {
        pairKey: "custom:kickboard:300:75:BULLNOSE:3000",
        groupKey: "kickboards",
        groupTitle: "Kickboards",
        sortOrder: 8300,
      },
    });
    workbook.sections[0]?.rows.push({
      code: "MAT_CUSTOM_GOAL_UNIT_5200_4200_BASKETBALL",
      label: "5.2m x 4.2m goal unit with basketball post",
      unit: "item",
      rate: 0,
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: "goal-unit:5200:4200:basketball:count" },
      category: "GOAL_UNITS",
      presentation: {
        pairKey: "custom:goal-unit:5200:4200:basketball",
        groupKey: "goal-units",
        groupTitle: "Goal units",
        sortOrder: 8000,
      },
    });

    const options = buildEditorPricingOptions(workbook);

    expect(options.floodlightColumnHeightOptionsMm).toContain(7500);
    expect(options.goalUnitOptions).toContainEqual(
      expect.objectContaining({
        widthMm: 3000,
        goalHeightMm: 3000,
        hasBasketballPost: false,
      }),
    );
    expect(options.goalUnitOptions).toContainEqual(
      expect.objectContaining({
        widthMm: 5200,
        goalHeightMm: 4200,
        hasBasketballPost: true,
      }),
    );
    expect(options.kickboardOptions).toContainEqual(
      expect.objectContaining({
        sectionHeightMm: 300,
        thicknessMm: 75,
        profile: "BULLNOSE",
        boardLengthMm: 3000,
      }),
    );
  });
});
