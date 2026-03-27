import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DrawingPreview } from "./DrawingPreview";

describe("DrawingPreview rendering", () => {
  it("renders SVG with actual segment data", () => {
    const layout = {
      segments: [{
        id: "s1",
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        spec: { system: "TWIN_BAR" as const, height: "2m" as const, twinBarVariant: "STANDARD" as const }
      }],
      gates: []
    };

    const html = renderToStaticMarkup(
      <DrawingPreview layout={layout} label="Test" variant="card" />
    );

    console.log("Contains SVG:", html.includes("<svg"));
    console.log("Contains Blank drawing:", html.includes("Blank drawing"));
    console.log("HTML length:", html.length);
    console.log("First 800 chars:", html.substring(0, 800));

    expect(html).toContain("<svg");
    expect(html).not.toContain("Blank drawing");
    expect(html).toContain("stroke-width");
  });

  it("renders blank state when no segments", () => {
    const layout = {
      segments: [],
      gates: []
    };

    const html = renderToStaticMarkup(
      <DrawingPreview layout={layout} label="Test" variant="card" />
    );

    console.log("Empty layout HTML:", html.substring(0, 200));

    expect(html).toContain("Blank drawing");
    expect(html).not.toContain("<svg");
  });
});
