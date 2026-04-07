import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditorOverlayPanels } from "./EditorOverlayPanels.js";

describe("EditorOverlayPanels", () => {
  it("renders count summaries with collapsible post key and no workflow guide", () => {
    const html = renderToStaticMarkup(
      <EditorOverlayPanels
        postRowsByType={{
          end: [{ heightMm: 2000, count: 2 }],
          intermediate: [],
          corner: [],
          junction: [],
          inlineJoin: []
        }}
        gateCounts={{ total: 1, single: 1, double: 0, custom: 0 }}
        gateCountsByHeight={{
          single: [{ height: "2m", count: 1 }],
          double: [],
          custom: []
        }}
        basketballPostCountsByHeight={[{ height: "2m", count: 2 }]}
        floodlightColumnCountsByHeight={[{ height: "2m", count: 1 }]}
        twinBarFenceRows={[{ height: "2m", standard: 4, superRebound: 1 }]}
        featureCounts={{ goalUnits: 1, kickboards: 2, pitchDividers: 1, sideNettings: 20.2 }}
        featureRowsByKind={{
          goalUnits: [{ label: "Goal unit 3m x 3m", value: "1 item" }],
          kickboards: [{ label: "200 x 50 square kickboards", value: "2 board" }],
          pitchDividers: [{ label: "Pitch-divider netting run", value: "12 m" }],
          sideNettings: [
            { label: "+2000mm side netting", value: "10.1 m" },
            { label: "Total netting area", value: "20.2 m2" }
          ]
        }}
        postTypeCounts={{
          END: 2,
          INTERMEDIATE: 3,
          CORNER: 1,
          JUNCTION: 0,
          INLINE_JOIN: 0,
          GATE: 2
        }}
        panelCount={5}
        fenceRunCount={2}
        formatHeightLabelFromMm={(value) => `${value / 1000}m`}
      />,
    );

    expect(html).toContain("Item Counts");
    expect(html).toContain("Show Detail");
    expect(html).toContain("Post Key");
    expect(html).toContain("Open the key when you need to map canvas symbols to post counts.");
    expect(html).not.toContain("Workflow Guide");
    expect(html).toContain("Panels");
    expect(html).toContain("Basketball Posts");
    expect(html).toContain("BB Posts");
    expect(html).toContain("Floodlights");
    expect(html).toContain("Goal Units");
    expect(html).toContain("Kickboard Boards");
  });
});
