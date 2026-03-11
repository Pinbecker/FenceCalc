import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FenceSpec } from "@fence-estimator/contracts";

import { EditorFencePalettePanel } from "./EditorFencePalettePanel.js";

describe("EditorFencePalettePanel", () => {
  it("renders fence system and variant controls", () => {
    const activeSpec: FenceSpec = {
      system: "TWIN_BAR",
      height: "2m",
      twinBarVariant: "STANDARD"
    };

    const html = renderToStaticMarkup(
      <EditorFencePalettePanel
        activeSpec={activeSpec}
        activeHeightOptions={["1.8m", "2m"]}
        twinBarHeightOptions={["1.8m", "2m"]}
        rollFormHeightOptions={["2m"]}
        onSetActiveSpec={vi.fn()}
        getSegmentColor={() => "#ffffff"}
      />,
    );

    expect(html).toContain("Fence Palette");
    expect(html).toContain("Twin Bar");
    expect(html).toContain("Super Rebound");
  });
});
