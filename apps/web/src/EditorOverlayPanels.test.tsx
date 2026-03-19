import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorOverlayPanels } from "./EditorOverlayPanels.js";

describe("EditorOverlayPanels", () => {
  it("renders count summaries, post key, and tutorial trigger", () => {
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
        gateCountsByHeight={[{ height: "2m", count: 1 }]}
        basketballPostCountsByHeight={[{ height: "2m", count: 2 }]}
        floodlightColumnCountsByHeight={[{ height: "2m", count: 1 }]}
        twinBarFenceRows={[{ height: "2m", standard: 4, superRebound: 1 }]}
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
        isTutorialOpen={false}
        onOpenTutorial={vi.fn()}
        onCloseTutorial={vi.fn()}
        formatHeightLabelFromMm={(value) => `${value / 1000}m`}
      />,
    );

    expect(html).toContain("Item Counts");
    expect(html).toContain("Show Detail");
    expect(html).toContain("Post Key");
    expect(html).toContain("Workflow Guide");
    expect(html).toContain("Panels");
    expect(html).toContain("Basketball Posts");
    expect(html).toContain("BB Posts");
    expect(html).toContain("Floodlights");
  });
});
