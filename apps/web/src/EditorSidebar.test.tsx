import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FenceHeightKey, FenceSpec } from "@fence-estimator/contracts";

import { EditorToolPalette } from "./EditorToolPalette.js";
import { formatLengthMm, formatMetersInputFromMm } from "./formatters.js";
import { defaultFenceSpec, getSegmentColor } from "./editor/constants.js";

function buildToolPaletteProps() {
  const activeHeightOptions: FenceHeightKey[] = ["2m", "2.4m"];
  const twinBarHeightOptions: FenceHeightKey[] = ["2m", "2.4m"];
  const rollFormHeightOptions: FenceHeightKey[] = ["2m", "3m"];

  return {
    interactionMode: "GATE" as const,
    recessWidthInputM: "1.50",
    recessDepthInputM: "1.00",
    gateType: "DOUBLE_LEAF" as const,
    customGateWidthInputM: "3.00",
    recessWidthOptionsMm: [500, 1000, 1500],
    recessDepthOptionsMm: [500, 1000],
    gateWidthOptionsMm: [1200, 1800, 3000],
    goalUnitWidthMm: 3000 as const,
    goalUnitHeightMm: 3000 as const,
    goalUnitHasBasketballPost: false,
    goalUnitWidthOptionsMm: [3000, 3600, 4800] as const,
    goalUnitHeightOptionsMm: [3000, 4000] as const,
    goalUnitOptions: [
      { key: "3000:3000:plain", label: "3m x 3m", widthMm: 3000, goalHeightMm: 3000, hasBasketballPost: false }
    ],
    basketballPlacementType: "DEDICATED_POST" as const,
    basketballArmLengthMm: 1800 as const,
    basketballArmLengthOptionsMm: [1200, 1800] as const,
    kickboardSectionHeightMm: 200 as const,
    kickboardProfile: "SQUARE" as const,
    kickboardThicknessMm: 50,
    kickboardBoardLengthMm: 2500,
    kickboardOptions: [
      {
        key: "200:50:SQUARE:2500",
        label: "200 x 50 Square | 2500mm",
        sectionHeightMm: 200,
        thicknessMm: 50,
        profile: "SQUARE",
        boardLengthMm: 2500
      }
    ],
    floodlightColumnHeightMm: 6000,
    floodlightColumnHeightOptionsMm: [6000] as const,
    sideNettingHeightMm: 2000,
    sideNettingHeightOptionsMm: [500, 1000, 1500, 2000] as const,
    activeSpec: defaultFenceSpec(),
    activeHeightOptions,
    twinBarHeightOptions,
    rollFormHeightOptions,
    formatLengthMm,
    formatMetersInputFromMm,
    getSegmentColor,
    onSetInteractionMode: vi.fn(),
    onRecessWidthInputChange: vi.fn(),
    onRecessDepthInputChange: vi.fn(),
    onNormalizeRecessInputs: vi.fn(),
    onSetGoalUnitWidthMm: vi.fn(),
    onSetGoalUnitHeightMm: vi.fn(),
    onSetGoalUnitHasBasketballPost: vi.fn(),
    onSetGateType: vi.fn(),
    onSetBasketballPlacementType: vi.fn(),
    onSetBasketballArmLengthMm: vi.fn(),
    onSetKickboardSectionHeightMm: vi.fn(),
    onSetKickboardProfile: vi.fn(),
    onSetKickboardThicknessMm: vi.fn(),
    onSetKickboardBoardLengthMm: vi.fn(),
    onSetFloodlightColumnHeightMm: vi.fn(),
    onSetSideNettingHeightMm: vi.fn(),
    onCustomGateWidthInputChange: vi.fn(),
    onNormalizeGateInputs: vi.fn(),
    onSetActiveSpec: vi.fn((updater: (previous: FenceSpec) => FenceSpec) => updater(defaultFenceSpec()))
  };
}

describe("EditorToolPalette", () => {
  it("renders tool buttons for all interaction modes", () => {
    const html = renderToStaticMarkup(<EditorToolPalette {...buildToolPaletteProps()} />);

    expect(html).toContain("tool-palette");
    expect(html).toContain("Gate (G)");
    expect(html).toContain("Floodlight (F)");
    expect(html).toContain("Select (S)");
    expect(html).toContain("Draw (D)");
  });
});
