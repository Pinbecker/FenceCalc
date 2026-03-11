import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorInteractionPanel } from "./EditorInteractionPanel.js";

describe("EditorInteractionPanel", () => {
  it("renders wider interaction controls and gate options", () => {
    const html = renderToStaticMarkup(
      <EditorInteractionPanel
        interactionMode="GATE"
        recessWidthInputM="1.50"
        recessDepthInputM="1.00"
        recessSide="LEFT"
        gateType="CUSTOM"
        customGateWidthInputM="2.40"
        recessWidthOptionsMm={[500, 1000]}
        recessDepthOptionsMm={[500, 1000]}
        gateWidthOptionsMm={[1200, 2400]}
        recessPreview={null}
        gatePreview={null}
        formatLengthMm={(value) => `${value}mm`}
        formatMetersInputFromMm={(value) => `${value / 1000}`}
        onSetInteractionMode={vi.fn()}
        onRecessWidthInputChange={vi.fn()}
        onRecessDepthInputChange={vi.fn()}
        onNormalizeRecessInputs={vi.fn()}
        onSetRecessSide={vi.fn()}
        onSetGateType={vi.fn()}
        onCustomGateWidthInputChange={vi.fn()}
        onNormalizeGateInputs={vi.fn()}
      />,
    );

    expect(html).toContain("Rectangle");
    expect(html).toContain("Custom Gate Width");
    expect(html).toContain("Single 1.2m");
  });
});
