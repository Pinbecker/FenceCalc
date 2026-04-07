import { describe, expect, it } from "vitest";

import type { EstimateWorkbook, EstimateWorkbookRow } from "@fence-estimator/contracts";

import { buildEstimateDisplaySections } from "./workbookPresentation.js";

function buildWorkbook(rows: EstimateWorkbookRow[]): EstimateWorkbook {
  return {
    settings: {
      travelLodgePerDay: 90,
      markupRate: 250,
      distributionCharge: 215,
      concretePricePerCube: 150,
      colourOption: "Black or Green",
    },
    sections: [
      {
        key: "materials-installables",
        sheet: "MATERIALS",
        title: "Installable materials",
        subtotal: rows.reduce((sum, row) => sum + row.total, 0),
        rows,
      },
    ],
    manualEntries: [],
    commercialInputs: {},
    totals: {
      materialsSubtotal: rows.reduce((sum, row) => sum + row.total, 0),
      labourSubtotal: 0,
      distributionCharge: 0,
      travelTotal: 0,
      markupRate: 0,
      markupTotal: 0,
      grandTotal: rows.reduce((sum, row) => sum + row.total, 0),
    },
  };
}

function buildRow(
  code: string,
  label: string,
  quantity: number,
  total: number,
  presentation: EstimateWorkbookRow["presentation"],
): EstimateWorkbookRow {
  return {
    code,
    label,
    unit: "item",
    quantity,
    rate: quantity > 0 ? total / quantity : 0,
    rateMode: "MONEY",
    total,
    isEditable: false,
    presentation,
  };
}

describe("buildEstimateDisplaySections", () => {
  it("splits post/gate rows and panel rows into height-specific sections with stable ordering", () => {
    const workbook = buildWorkbook([
      buildRow(
        "MAT_POST_2000_INTERMEDIATE",
        "Intermediate posts",
        3,
        30,
        { pairKey: "post:2000:intermediate", groupKey: "height-2000", groupTitle: "2m height", sortOrder: 2 },
      ),
      buildRow(
        "MAT_GATE_2m_SINGLE_LEAF",
        "Single leaf gate 2m H x 1.20m W",
        1,
        100,
        { pairKey: "gate:2m:SINGLE_LEAF", groupKey: "height-2000", groupTitle: "2m height", sortOrder: 2 },
      ),
      buildRow(
        "MAT_POST_2000_END",
        "End posts",
        2,
        20,
        { pairKey: "post:2000:end", groupKey: "height-2000", groupTitle: "2m height", sortOrder: 2 },
      ),
      buildRow(
        "MAT_PANEL_4m_1000_FIRST_STANDARD",
        "Standard 1000mm panel | first",
        2,
        40,
        { pairKey: "panel:4m:1000:FIRST:STANDARD", groupKey: "height-4000", groupTitle: "4m height", sortOrder: 5 },
      ),
      buildRow(
        "MAT_PANEL_4m_3000_GROUND_STANDARD",
        "Standard 3000mm panel | ground",
        2,
        80,
        { pairKey: "panel:4m:3000:GROUND:STANDARD", groupKey: "height-4000", groupTitle: "4m height", sortOrder: 5 },
      ),
      buildRow(
        "MAT_PANEL_4m_1000_FIRST_SUPER_REBOUND",
        "Rebound 1000mm panel | first",
        1,
        25,
        { pairKey: "panel:4m:1000:FIRST:SUPER_REBOUND", groupKey: "height-4000", groupTitle: "4m height", sortOrder: 5 },
      ),
      buildRow(
        "MAT_TOP_RAIL_1.2m",
        "Top rails",
        4,
        88,
        { pairKey: "top-rail:1.2m", groupKey: "height-1200", groupTitle: "1.2m height", sortOrder: 0 },
      ),
    ]);

    const sections = buildEstimateDisplaySections(workbook, "MATERIALS");

    expect(sections.map((section) => section.title)).toEqual([
      "1.2m posts & gates",
      "2m posts & gates",
      "4m panels",
    ]);
    expect(sections[0]?.rows.map((row) => row.label)).toEqual(["Top rails"]);
    expect(sections[1]?.rows.map((row) => row.label)).toEqual([
      "End posts",
      "Intermediate posts",
      "Single leaf gate 2m H x 1.20m W",
    ]);
    expect(sections[2]?.rows.map((row) => row.label)).toEqual([
      "Standard 3000mm panel | ground",
      "Standard 1000mm panel | first",
      "Rebound 1000mm panel | first",
    ]);
  });
});
