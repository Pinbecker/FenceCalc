import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FenceHeightKey, FenceSpec } from "@fence-estimator/contracts";

import { EditorSidebar } from "./EditorSidebar.js";
import { formatLengthMm, formatMetersInputFromMm } from "./formatters.js";
import { defaultFenceSpec, getSegmentColor } from "./editor/constants.js";
function buildSidebarProps() {
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
    recessPreview: {
      depthMm: 1000,
      startOffsetMm: 1200,
      endOffsetMm: 2700,
      segmentLengthMm: 5000,
      side: "LEFT" as const,
      sideSource: "AUTO" as const,
      snapMeta: {
        label: "Centered"
      }
    },
    gatePreview: {
      widthMm: 3000,
      startOffsetMm: 1000,
      endOffsetMm: 4000,
      segmentLengthMm: 5000,
      snapMeta: {
        label: "Centered"
      }
    },
    basketballPostPreview: null,
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
    onSetGateType: vi.fn(),
    onCustomGateWidthInputChange: vi.fn(),
    onNormalizeGateInputs: vi.fn(),
    onSetActiveSpec: vi.fn((updater: (previous: FenceSpec) => FenceSpec) => updater(defaultFenceSpec()))
  };
}

describe("EditorSidebar", () => {
  it("renders the editor tool panels", () => {
    const html = renderToStaticMarkup(<EditorSidebar {...buildSidebarProps()} />);

    expect(html).toContain("Gate");
    expect(html).toContain("Fence Palette");
    expect(html).toContain("Choose the canvas task first");
  });
});
